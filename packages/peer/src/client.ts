import type { StandardRequest, StandardResponse } from '@standardserver/core'
import type { Queue } from '@standardserver/shared'
import type { PeerAbortMessage, PeerEventStreamMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage, PeerStreamCancelMessage } from './types'
import { AbortError, isAsyncIteratorObject, SequentialIdGenerator } from '@standardserver/shared'
import { encodeAtomicStandardBody, toStandardBody } from './body'
import { EventStreamTransmitter } from './event-stream'
import { OctetStreamTransmitter } from './octet-stream'

interface ClientPeerRequestStateInternal {
  resolve?: ((response: StandardResponse) => void) | undefined
  reject?: ((reason: unknown) => void) | undefined
  eventStreamMessageQueue?: Queue<PeerEventStreamMessage> | undefined
  octetStreamMessageQueue?: Queue<PeerOctetStreamMessage> | undefined
  eventStreamTransmitter?: EventStreamTransmitter | undefined
  octetStreamTransmitter?: OctetStreamTransmitter | undefined
  cleanupFns?: (() => void)[] | undefined
}

export class ClientPeer {
  private readonly idGenerator = new SequentialIdGenerator()
  private readonly requests = new Map<string, ClientPeerRequestStateInternal>()

  constructor(
    private readonly send: (
      message: PeerAbortMessage | PeerRequestMessage | PeerEventStreamMessage | PeerOctetStreamMessage,
    ) => Promise<void>,
  ) {
  }

  /**
   * Use to measure resources usage
   */
  get size(): number {
    return this.requests.size
  }

  /**
   * Send a request to the server peer
   */
  async request(request: StandardRequest): Promise<StandardResponse> {
    const signal = request.signal
    signal?.throwIfAborted()

    const id = this.idGenerator.generate()
    const state: ClientPeerRequestStateInternal = {}
    this.requests.set(id, state)

    let abortListener: () => Promise<void>
    signal?.addEventListener('abort', abortListener = () => this.abortById(id, signal.reason))
    /**
     * Make sure to remove the abort listener when the request/response is closed.
     * Since a signal can be reused for multiple requests, if each request
     * adds listeners without removing them, it can lead to excessive memory usage
     * until the signal is garbage collected.
     */
    state.cleanupFns ??= []
    state.cleanupFns.push(() => {
      signal?.removeEventListener('abort', abortListener)
    })

    try {
      const [jsonBody, headers, binary] = await encodeAtomicStandardBody(request.body, request.headers)

      // signal can be aborted during encode
      signal?.throwIfAborted()

      const requestMessage: PeerRequestMessage = {
        id,
        kind: 'request',
        json: {
          ...request,
          headers,
          body: jsonBody,
          ...{ signal: undefined }, // remove signal from request
        },
        binary,
      }

      // PeerRequestMessage must be sent before stream messages
      await this.send(requestMessage)

      // signal can be aborted after sending request message
      signal?.throwIfAborted()

      if (isAsyncIteratorObject(request.body)) {
        const transmitter = new EventStreamTransmitter(request.body, id, this.send)
        state.eventStreamTransmitter = transmitter

        // Do not await here; we don't want it to block response processing.
        void transmitter.transmit().catch(async (reason) => {
          if (state.eventStreamTransmitter) {
            state.eventStreamTransmitter = undefined
            await this.abortById(id, reason)
          }
          else {
            /**
             * We don't need to send abort message if transmitter was cancelled
             * or request was closed
             */
            state.eventStreamTransmitter = undefined
            await this.closeById(id, reason)
          }
        })
      }
      else if (request.body instanceof ReadableStream) {
        const transmitter = new OctetStreamTransmitter(request.body, id, this.send)
        state.octetStreamTransmitter = transmitter

        // Do not await here; we don't want it to block response processing.
        void transmitter.transmit().catch(async (reason) => {
          if (state.octetStreamTransmitter) {
            state.octetStreamTransmitter = undefined
            await this.abortById(id, reason)
          }
          else {
            /**
             * We don't need to send abort message if transmitter was cancelled
             * or request was closed
             */
            state.octetStreamTransmitter = undefined
            await this.closeById(id, reason)
          }
        })
      }
    }
    catch (reason) {
      await this.closeById(id, reason)
      throw reason
    }

    return new Promise((resolve, reject) => {
      state.resolve = resolve
      state.reject = reject
    })
  }

  /**
   * Handle a message from server
   */
  async message(
    message: PeerResponseMessage | PeerAbortMessage | PeerEventStreamMessage | PeerOctetStreamMessage | PeerStreamCancelMessage,
  ): Promise<void> {
    const id = message.id
    const state = this.requests.get(id)

    if (!state) { // request already closed or non-existing
      return
    }

    if (message.kind === 'stream/cancel') {
      const promise = Promise.all([
        state.eventStreamTransmitter?.cancel(),
        state.octetStreamTransmitter?.cancel(),
      ])
      state.eventStreamTransmitter = undefined
      state.octetStreamTransmitter = undefined

      await promise
      return
    }

    if (message.kind === 'abort') {
      await this.closeById(id, new AbortError('Server peer aborted the request'))
      return
    }

    if (message.kind === 'event-stream') {
      state.eventStreamMessageQueue?.push(message)
      return
    }

    if (message.kind === 'octet-stream') {
      state.octetStreamMessageQueue?.push(message)
      return
    }

    if (!state.resolve) { // duplicate response message
      return
    }

    try {
      const response: StandardResponse = message.json

      const decoded = await toStandardBody(message, async (isCompleted) => {
        if (!isCompleted) {
          await this.abortById(id)
        }
        else if (state.eventStreamMessageQueue || state.octetStreamMessageQueue) {
          await this.closeById(id)
        }
      })
      response.body = decoded.body
      state.eventStreamMessageQueue = decoded.eventStreamMessageQueue
      state.octetStreamMessageQueue = decoded.octetStreamMessageQueue

      state.resolve?.(response)
      state.resolve = undefined
      state.reject = undefined

      if (!state.eventStreamMessageQueue && !state.octetStreamMessageQueue) {
        // if there is no stream, we can close the request immediately
        await this.closeById(id)
      }
    }
    catch (reason) {
      await this.closeById(id, reason)
    }
  }

  async close(reason?: unknown): Promise<void> {
    reason ??= new AbortError('Peer was closed')

    await Promise.all(
      Array.from(this.requests.keys()).map(id => this.closeById(id, reason)),
    )
  }

  private async closeById(id: string, reason?: unknown): Promise<void> {
    const state = this.requests.get(id)

    if (!state) { // already closed
      return
    }

    this.requests.delete(id)
    reason ??= new AbortError('Request was closed')

    state.reject?.(reason)
    state.resolve = undefined
    state.reject = undefined

    state.eventStreamMessageQueue?.close(reason)
    state.octetStreamMessageQueue?.close(reason)
    state.eventStreamMessageQueue = undefined
    state.octetStreamMessageQueue = undefined

    const promises = [
      state.eventStreamTransmitter?.cancel(),
      state.octetStreamTransmitter?.cancel(),
    ]
    state.eventStreamTransmitter = undefined
    state.octetStreamTransmitter = undefined

    state.cleanupFns?.forEach(fn => fn())
    state.cleanupFns = undefined

    await Promise.all(promises)
  }

  private async abortById(id: string, reason?: unknown): Promise<void> {
    const state = this.requests.get(id)

    if (!state) { // already closed
      return
    }

    this.requests.delete(id)
    reason ??= new AbortError('Request was aborted')

    state.reject?.(reason)
    state.resolve = undefined
    state.reject = undefined

    state.eventStreamMessageQueue?.abort(reason)
    state.octetStreamMessageQueue?.abort(reason)
    state.eventStreamMessageQueue = undefined
    state.octetStreamMessageQueue = undefined

    const promises = [
      state.eventStreamTransmitter?.cancel(),
      state.octetStreamTransmitter?.cancel(),
      this.send({ id, kind: 'abort' }),
    ]
    state.eventStreamTransmitter = undefined
    state.octetStreamTransmitter = undefined

    state.cleanupFns?.forEach(fn => fn())
    state.cleanupFns = undefined

    await Promise.all(promises)
  }
}
