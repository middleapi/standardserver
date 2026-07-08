import type { StandardLazyRequest, StandardResponse } from '@standardserver/core'
import type { Queue } from '@standardserver/shared'
import type { ClientPeerSendMessage, PeerEventStreamMessage, PeerOctetStreamMessage, PeerResponseMessage, ServerPeerSendMessage } from './types'
import { AbortError, isAsyncIteratorObject } from '@standardserver/shared'
import { encodeAtomicStandardBody, toStandardBody } from './body'
import { EventStreamTransmitter } from './event-stream'
import { HibernationAsyncIteratorClass } from './hibernation'
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
    private readonly send: (message: ServerPeerSendMessage) => Promise<void>,
  ) {
  }

  /**
   * Handle a message from client
   */
  async message(
    message: ClientPeerSendMessage,
    handleRequest: (request: StandardLazyRequest) => Promise<StandardResponse>,
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
      const decoded = toStandardBody(message, async ({ kind }) => {
        if (kind === 'cancelled' && (state.eventStreamMessageQueue || state.octetStreamMessageQueue)) {
          // only need cancel stream if streams is still active
          state.eventStreamMessageQueue = undefined
          state.octetStreamMessageQueue = undefined
          await this.send({ id, kind: 'stream/cancel' })
        }
      })
      state.eventStreamMessageQueue = decoded.eventStreamMessageQueue
      state.octetStreamMessageQueue = decoded.octetStreamMessageQueue

      const response = await handleRequest({
        url: message.json.url,
        method: message.json.method,
        headers: message.json.headers,
        resolveBody: decoded.resolveBody,
        signal,
      })

      // only send message if still open and not aborted
      if (signal.aborted) {
        return
      }

      const encodedAtomicBody = await encodeAtomicStandardBody(response.body, response.headers)

      // signal can abort during encode
      if (signal.aborted) {
        return
      }

      const responseMessage: PeerResponseMessage = {
        id: message.id,
        kind: 'response',
        json: {
          status: response.status,
          headers: encodedAtomicBody.headers,
          bodyHint: encodedAtomicBody.bodyHint,
          body: encodedAtomicBody.jsonBody,
        },
        binary: encodedAtomicBody.binary,
      }

      // PeerResponseMessage must be sent before stream messages
      await this.send(responseMessage)

      // signal can abort during send response message
      if (signal.aborted) {
        return
      }

      if (isAsyncIteratorObject(response.body)) {
        if (response.body instanceof HibernationAsyncIteratorClass) {
          await response.body['~callback']?.(message.id)
        }
        else {
          const transmitter = new EventStreamTransmitter(response.body, message.id, this.send)
          state.eventStreamTransmitter = transmitter
          await transmitter.transmit().catch(async (reason) => {
            // only cancel if stream transmitter is still active
            if (state.eventStreamTransmitter) {
              await this.cancelById(message.id, reason)
            }

            // WARNING: errors that occur here are silently ignored.
          })
        }
      }
      else if (response.body instanceof ReadableStream) {
        const transmitter = new OctetStreamTransmitter(response.body, message.id, this.send)
        state.octetStreamTransmitter = transmitter
        await transmitter.transmit().catch(async (reason) => {
          // only cancel if stream transmitter is still active
          if (state.octetStreamTransmitter) {
            await this.cancelById(message.id, reason)
          }

          // WARNING: errors that occur here are silently ignored.
        })
      }

      // close without aborting, because the request is finished successfully
      state.controller = undefined
      await this.closeById(id)
    }
    catch (reason) {
      await this.cancelById(message.id, reason)
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

  private async cancelById(id: string, reason?: unknown): Promise<void> {
    await Promise.all([
      /**
       * Do not need to send cancel message if request was closed or aborted
       */
      this.requests.has(id) ? this.send({ id, kind: 'cancel' }) : undefined,
      this.closeById(id, reason),
    ])
  }
}
