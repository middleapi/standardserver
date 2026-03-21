import type { StandardLazyResponse, StandardRequest } from '@standardserver/core'
import type { Queue } from '@standardserver/shared'
import type { ClientPeerSendMessage, PeerEventStreamMessage, PeerOctetStreamMessage, ServerPeerSendMessage } from './types'
import { AbortError, emitUnhandledRejection, isAsyncIteratorObject, omit, SequentialIdGenerator } from '@standardserver/shared'
import { encodeAtomicStandardBody, toStandardBody } from './body'
import { EventStreamTransmitter } from './event-stream'
import { OctetStreamTransmitter } from './octet-stream'

interface ClientPeerRequestStateInternal {
  resolve?: ((response: StandardLazyResponse) => void) | undefined
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
    private readonly send: (message: ClientPeerSendMessage) => Promise<void>,
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
  async request(request: StandardRequest): Promise<StandardLazyResponse> {
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

      // PeerRequestMessage must be sent before stream messages
      await this.send({
        id,
        kind: 'request',
        json: {
          ...omit(request, ['signal']),
          headers,
          body: jsonBody,
        },
        binary,
      })

      // signal can be aborted after sending request message
      signal?.throwIfAborted()

      if (isAsyncIteratorObject(request.body)) {
        const transmitter = new EventStreamTransmitter(request.body, id, this.send)
        state.eventStreamTransmitter = transmitter

        // Do not await here; we don't want it to block response processing.
        void transmitter.transmit().catch(async (error) => {
          if (state.eventStreamTransmitter) { // stream transmitter is still active
            await this.abortById(id, error)
          }
          else {
            /**
             * The request has already been closed or the stream transmitter
             * was cancelled earlier.
             *
             * This error should not affect the current flow. Instead, forward it
             * as an unhandled rejection so it can be noticed and fixed.
             */
            emitUnhandledRejection(error)
          }
        })
      }
      else if (request.body instanceof ReadableStream) {
        const transmitter = new OctetStreamTransmitter(request.body, id, this.send)
        state.octetStreamTransmitter = transmitter

        // Do not await here; we don't want it to block response processing.
        void transmitter.transmit().catch(async (error) => {
          if (state.octetStreamTransmitter) { // stream transmitter is still active
            await this.abortById(id, error)
          }

          /**
           * ReadableStream does not throw after cancel, so this branch is unlikely.
           * It exists for completeness to cover all edge cases.
           * v8 ignore start -- @preserve
           */
          else {
            /**
             * The request has already been closed or the stream transmitter
             * was cancelled earlier.
             *
             * This error should not affect the current flow. Instead, forward it
             * as an unhandled rejection so it can be noticed and fixed.
             */
            emitUnhandledRejection(error)
          }
          /* v8 ignore stop -- @preserve */
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
    message: ServerPeerSendMessage,
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

    if (message.kind === 'cancel') {
      await this.closeById(id, new AbortError('Server canceled the request'))
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

    const resolve = state.resolve
    state.resolve = undefined

    try {
      const decoded = toStandardBody(message, async ({ isCancelled, error }) => {
        if (isCancelled) {
          await this.abortById(id, error)
        }
        else if (state.eventStreamMessageQueue || state.octetStreamMessageQueue) {
          await this.closeById(id, error)
        }
      })
      state.eventStreamMessageQueue = decoded.eventStreamMessageQueue
      state.octetStreamMessageQueue = decoded.octetStreamMessageQueue

      resolve({ ...message.json, resolveBody: decoded.resolveBody })

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
      this.send({ id, kind: 'cancel' }),
      state.eventStreamTransmitter?.cancel(),
      state.octetStreamTransmitter?.cancel(),
    ]
    state.eventStreamTransmitter = undefined
    state.octetStreamTransmitter = undefined

    state.cleanupFns?.forEach(fn => fn())
    state.cleanupFns = undefined

    await Promise.all(promises)
  }
}
