import type { StandardBodyHint, StandardRequest, StandardResponse } from '@standardserver/core'
import type { AsyncIdQueueCloseOptions } from '@standardserver/shared'
import type { PeerAbortMessage, PeerEventStreamMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage } from './types'
import { generateContentDisposition } from '@standardserver/core'
import { AbortError, AsyncIdQueue, isAsyncIteratorObject } from '@standardserver/shared'
import { toStandardBody } from './body'
import { sendEventIterator } from './event-stream'
import { HibernationEventIterator } from './hibernation'
import { sendOctetStream } from './octet-stream'

export interface ServerPeerCloseOptions extends AsyncIdQueueCloseOptions {}

export class ServerPeer {
  /**
   * Messages waiting to be processed
   */
  private readonly eventStreamMessageQueue = new AsyncIdQueue<PeerEventStreamMessage>()
  private readonly octetStreamMessageQueue = new AsyncIdQueue<PeerOctetStreamMessage>()

  /**
   * Map of abort controllers for each request
   */
  private readonly controller = new Map<string, AbortController>()

  constructor(
    private readonly send: (message: PeerResponseMessage | PeerAbortMessage | PeerOctetStreamMessage | PeerEventStreamMessage) => Promise<void>,
  ) {
    this.send = async (message) => {
      // only send message if still open
      if (this.controller.has(message.id)) {
        await send(message)
      }
    }
  }

  /**
   * Use for measure resources usage
   */
  get size(): number {
    return this.eventStreamMessageQueue.length
      + this.octetStreamMessageQueue.length
      + this.controller.size
  }

  /**
   * Handle a message from client
   */
  async message(
    message: PeerRequestMessage | PeerEventStreamMessage | PeerOctetStreamMessage | PeerAbortMessage,
    handleRequest: (request: StandardRequest) => Promise<StandardResponse>,
  ): Promise<void> {
    if (message.kind === 'abort') {
      this.close({ id: message.id, reason: new AbortError('Client aborted the request') })
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

    try {
      const request: StandardRequest = {
        ...message.json,
        query: message.json.query !== undefined ? new URLSearchParams(message.json.query) : undefined,
        signal: controller.signal,
        body: await toStandardBody(
          message,
          this.eventStreamMessageQueue,
          this.octetStreamMessageQueue,
          async () => {
            // Stop buffering incoming messages in memory without aborting the request.
            this.eventStreamMessageQueue.close({ id: message.id })
            this.octetStreamMessageQueue.close({ id: message.id })
          },
        ),
      }

      const response = await handleRequest(request)

      // only send message if still open and not aborted
      if (controller.signal.aborted) {
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

      if (controller.signal.aborted) {
        return
      }
      /**
       * We should send response message before event iterator messages,
       * so the server can recognize them as part of the response.
       */
      await this.send(responseMessage)
      if (controller.signal.aborted) {
        return
      }

      if (isAsyncIteratorObject(response.body)) {
        if (response.body instanceof HibernationEventIterator) {
          response.body.hibernationCallback?.(message.id)
        }
        else {
          const iterator = response.body
          await sendEventIterator(iterator, message.id, controller.signal, this.send)
        }
      }
      else if (response.body instanceof ReadableStream) {
        await sendOctetStream(response.body, message.id, controller.signal, this.send)
      }

      // close without aborting, because the request is finished successfully
      this.controller.delete(message.id)
      this.close({ id: message.id })
    }
    catch (reason) {
      // there error while handling or sending response
      // so we need let client know by sending abort message
      await this.send({ id: message.id, kind: 'abort' })
      this.close({ id: message.id, reason })
      throw reason
    }
  }

  close(options: ServerPeerCloseOptions = {}): void {
    if (options.id === undefined) {
      this.controller.forEach(c => c.abort(options.reason))
      this.controller.clear()
    }
    else {
      this.controller.get(options.id)?.abort(options.reason)
      this.controller.delete(options.id)
    }

    this.eventStreamMessageQueue.close(options)
    this.octetStreamMessageQueue.close(options)
  }
}
