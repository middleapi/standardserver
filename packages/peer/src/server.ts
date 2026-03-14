import type { StandardRequest, StandardResponse } from '@standardserver/core'
import type { Queue } from '@standardserver/shared'
import type { PeerCancelMessage, PeerEventStreamMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage, PeerStreamCancelMessage } from './types'
import { AbortError, isAsyncIteratorObject } from '@standardserver/shared'
import { encodeAtomicStandardBody, toStandardBody } from './body'
import { EventStreamTransmitter } from './event-stream'
import { HibernationEventIterator } from './hibernation'
import { OctetStreamTransmitter } from './octet-stream'

interface ServerPeerRequestStateInternal {
  controller?: AbortController | undefined
  eventStreamMessageQueue?: Queue<PeerEventStreamMessage> | undefined
  octetStreamMessageQueue?: Queue<PeerOctetStreamMessage> | undefined
  eventStreamTransmitter?: EventStreamTransmitter | undefined
  octetStreamTransmitter?: OctetStreamTransmitter | undefined
}

export class ServerPeer {
  private readonly requests = new Map<string, ServerPeerRequestStateInternal>()

  constructor(
    private readonly send: (
      message: PeerResponseMessage | PeerCancelMessage | PeerOctetStreamMessage | PeerEventStreamMessage | PeerStreamCancelMessage,
    ) => Promise<void>,
  ) {
  }

  /**
   * Use for measure resources usage
   */
  get size(): number {
    return this.requests.size
  }

  /**
   * Handle a message from client
   */
  async message(
    message: PeerRequestMessage | PeerEventStreamMessage | PeerOctetStreamMessage | PeerCancelMessage,
    handleRequest: (request: StandardRequest) => Promise<StandardResponse>,
  ): Promise<void> {
    const id = message.id

    if (message.kind === 'cancel') {
      await this.closeById(id, new AbortError('Client aborted the request'))
      return
    }

    if (message.kind === 'event-stream') {
      this.requests.get(id)?.eventStreamMessageQueue?.push(message)
      return
    }

    if (message.kind === 'octet-stream') {
      this.requests.get(id)?.octetStreamMessageQueue?.push(message)
      return
    }

    if (this.requests.has(id)) { // duplicate request message
      return
    }

    const controller = new AbortController()
    const state: ServerPeerRequestStateInternal = { controller }
    this.requests.set(id, state)
    const signal = controller.signal

    try {
      const request: StandardRequest = { ...message.json, signal }

      const decoded = await toStandardBody(message, async (isCompleted) => {
        if (!isCompleted) {
          state.eventStreamMessageQueue = undefined
          state.octetStreamMessageQueue = undefined
          await this.send({ id, kind: 'stream/cancel' })
        }
      })
      request.body = decoded.body
      state.eventStreamMessageQueue = decoded.eventStreamMessageQueue
      state.octetStreamMessageQueue = decoded.octetStreamMessageQueue

      const response = await handleRequest(request)

      // only send message if still open and not aborted
      if (signal.aborted) {
        return
      }

      const [jsonBody, headers, binary] = await encodeAtomicStandardBody(response.body, response.headers)

      // signal can abort during encode
      if (signal.aborted) {
        return
      }

      const responseMessage: PeerResponseMessage = {
        id: message.id,
        kind: 'response',
        json: {
          ...response,
          headers,
          body: jsonBody,
          ...{ signal: undefined }, // remove signal from request
        },
        binary,
      }

      // PeerResponseMessage must be sent before stream messages
      await this.send(responseMessage)

      // signal can abort during send response message
      if (signal.aborted) {
        return
      }

      if (isAsyncIteratorObject(response.body)) {
        if (response.body instanceof HibernationEventIterator) {
          response.body.hibernationCallback?.(message.id)
        }
        else {
          const transmitter = new EventStreamTransmitter(response.body, message.id, this.send)
          state.eventStreamTransmitter = transmitter
          await transmitter.transmit()
        }
      }
      else if (response.body instanceof ReadableStream) {
        const transmitter = new OctetStreamTransmitter(response.body, message.id, this.send)
        state.octetStreamTransmitter = transmitter
        await transmitter.transmit()
      }

      // close without aborting, because the request is finished successfully
      state.controller = undefined
      await this.closeById(id)
    }
    catch (reason) {
      await Promise.all([
        /**
         * Do not need to send cancel message if request was closed or aborted
         */
        this.requests.has(message.id) ? this.send({ id: message.id, kind: 'cancel' }) : undefined,
        this.closeById(id, reason),
      ])

      throw reason
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

    if (!state) { // already closed or aborted
      return
    }

    this.requests.delete(id)
    reason ??= new AbortError('Request was closed')

    state.controller?.abort(reason)
    state.controller = undefined

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

    await Promise.all(promises)
  }
}
