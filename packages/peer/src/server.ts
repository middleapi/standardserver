import type { StandardBodyHint, StandardRequest, StandardResponse } from '@standardserver/core'
import type { AsyncIdQueueCloseOptions } from '@standardserver/shared'
import type {
  PeerAbortMessage,
  PeerEventStreamMessage,
  PeerOctetStreamMessage,
  PeerRequestMessage,
  PeerResponseMessage,
  PeerStreamCancelMessage,
} from './types'
import { generateContentDisposition, stringToUrl } from '@standardserver/core'
import { AbortError, AsyncIdQueue, isAsyncIteratorObject } from '@standardserver/shared'
import { toStandardBody } from './body'
import { EventStreamTransmitter } from './event-stream'
import { HibernationEventIterator } from './hibernation'
import { OctetStreamTransmitter } from './octet-stream'

export interface ServerPeerCloseOptions extends AsyncIdQueueCloseOptions {}

export class ServerPeer {
  /**
   * Messages waiting to be processed
   */
  private readonly eventStreamMessageQueue = new AsyncIdQueue<PeerEventStreamMessage>()
  private readonly octetStreamMessageQueue = new AsyncIdQueue<PeerOctetStreamMessage>()

  private readonly eventStreamTransmitters = new Map<string, EventStreamTransmitter>()
  private readonly octetStreamTransmitters = new Map<string, OctetStreamTransmitter>()

  /**
   * Map of abort controllers for each request
   */
  private readonly controller = new Map<string, AbortController>()

  constructor(
    private readonly send: (
      message: PeerResponseMessage | PeerAbortMessage | PeerOctetStreamMessage | PeerEventStreamMessage | PeerStreamCancelMessage,
    ) => Promise<void>,
  ) {
  }

  /**
   * Use for measure resources usage
   */
  get size(): number {
    return this.eventStreamMessageQueue.length
      + this.octetStreamMessageQueue.length
      + this.controller.size
      + this.eventStreamTransmitters.size
      + this.octetStreamTransmitters.size
  }

  /**
   * Handle a message from client
   */
  async message(
    message: PeerRequestMessage | PeerEventStreamMessage | PeerOctetStreamMessage | PeerAbortMessage,
    handleRequest: (request: StandardRequest) => Promise<StandardResponse>,
  ): Promise<void> {
    if (message.kind === 'abort') {
      await this.close({ id: message.id, reason: new AbortError('Client peer aborted the request') })
      return
    }

    if (message.kind === 'event-stream') {
      if (this.eventStreamMessageQueue.isOpen(message.id)) {
        this.eventStreamMessageQueue.push(message.id, message)
      }
      return
    }

    if (message.kind === 'octet-stream') {
      if (this.octetStreamMessageQueue.isOpen(message.id)) {
        this.octetStreamMessageQueue.push(message.id, message)
      }
      return
    }

    this.eventStreamMessageQueue.open(message.id)
    this.octetStreamMessageQueue.open(message.id)
    const controller = new AbortController()
    this.controller.set(message.id, controller)
    const signal = controller.signal

    try {
      const request: StandardRequest = {
        ...message.json,
        url: stringToUrl(message.json.url),
        signal,
        body: await toStandardBody(
          message,
          this.eventStreamMessageQueue,
          this.octetStreamMessageQueue,
          async (isCompleted) => {
            // Stop buffering incoming messages in memory without aborting the request.
            this.eventStreamMessageQueue.close({ id: message.id })
            this.octetStreamMessageQueue.close({ id: message.id })

            /**
             * We don't need to send stream cancel message if request was closed or aborted
             */
            if (!isCompleted && this.controller.has(message.id)) {
              // let client know that we no longer need stream messages
              await this.send({ id: message.id, kind: 'stream/cancel' })
            }
          },
        ),
      }

      const response = await handleRequest(request)

      // only send message if still open and not aborted
      if (signal.aborted) {
        return
      }

      const responseMessage: PeerResponseMessage = {
        id: message.id,
        kind: 'response',
        json: {
          ...{ ...response, signal: undefined }, // clone and remove signal from request
          headers: { ...response.headers }, // clone headers
        },
      }

      if (response.body instanceof ReadableStream) {
        responseMessage.json.body = undefined
        responseMessage.json.headers['standard-server'] = 'octet-stream' satisfies StandardBodyHint
      }
      else if (isAsyncIteratorObject(response.body)) {
        responseMessage.json.body = undefined
        responseMessage.json.headers['standard-server'] = 'event-stream' satisfies StandardBodyHint
      }
      else if (response.body instanceof FormData) {
        const res = new Response(response.body)
        responseMessage.binary = await res.blob()
        responseMessage.json.body = undefined
        responseMessage.json.headers['standard-server'] = 'form-data' satisfies StandardBodyHint
        responseMessage.json.headers['content-type'] = res.headers.get('content-type') ?? undefined
      }
      else if (response.body instanceof Blob) {
        responseMessage.binary = response.body
        responseMessage.json.body = undefined
        responseMessage.json.headers['standard-server'] = 'file' satisfies StandardBodyHint
        responseMessage.json.headers['content-disposition'] = generateContentDisposition(response.body instanceof File ? response.body.name : 'blob')
        responseMessage.json.headers['content-type'] = response.body.type
      }
      else if (response.body instanceof URLSearchParams) {
        responseMessage.json.body = response.body.toString()
        responseMessage.json.headers['standard-server'] = 'url-search-params' satisfies StandardBodyHint
      }

      if (signal.aborted) {
        return
      }
      /**
       * We should send response message before event iterator messages,
       * so the server can recognize them as part of the response.
       */
      await this.send(responseMessage)
      if (signal.aborted) {
        return
      }

      if (isAsyncIteratorObject(response.body)) {
        if (response.body instanceof HibernationEventIterator) {
          response.body.hibernationCallback?.(message.id)
        }
        else {
          const transmitter = new EventStreamTransmitter(response.body, message.id, this.send)
          this.eventStreamTransmitters.set(message.id, transmitter)
          await transmitter.transmit()
        }
      }
      else if (response.body instanceof ReadableStream) {
        const transmitter = new OctetStreamTransmitter(response.body, message.id, this.send)
        this.octetStreamTransmitters.set(message.id, transmitter)
        await transmitter.transmit()
      }

      // close without aborting, because the request is finished successfully
      this.controller.delete(message.id)
      await this.close({ id: message.id })
    }
    catch (reason) {
      await Promise.all([
        /**
         * Do not need to send abort message if request was closed or aborted
         */
        this.controller.has(message.id) ? this.send({ id: message.id, kind: 'abort' }) : undefined,
        this.close({ id: message.id, reason }),
      ])

      throw reason
    }
  }

  async close(options: ServerPeerCloseOptions = {}): Promise<void> {
    const promises: (Promise<void> | undefined)[] = []

    this.eventStreamMessageQueue.close(options)
    this.octetStreamMessageQueue.close(options)

    if (options.id === undefined) {
      this.eventStreamTransmitters.forEach(t => promises.push(t.cancel()))
      this.octetStreamTransmitters.forEach(t => promises.push(t.cancel()))

      this.eventStreamTransmitters.clear()
      this.octetStreamTransmitters.clear()

      this.controller.forEach(c => c.abort(options.reason))
      this.controller.clear()
    }
    else {
      promises.push(
        this.eventStreamTransmitters.get(options.id)?.cancel(),
        this.octetStreamTransmitters.get(options.id)?.cancel(),
      )

      this.eventStreamTransmitters.delete(options.id)
      this.octetStreamTransmitters.delete(options.id)

      this.controller.get(options.id)?.abort(options.reason)
      this.controller.delete(options.id)
    }

    await Promise.all(promises)
  }
}
