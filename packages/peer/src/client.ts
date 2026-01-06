import type { StandardBodyHint, StandardRequest, StandardResponse } from '@standardserver/core'
import type { AsyncIdQueueCloseOptions } from '@standardserver/shared'
import type { PeerAbortMessage, PeerEventStreamMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage } from './types'
import { generateContentDisposition, urlToString } from '@standardserver/core'
import { AbortError, AsyncIdQueue, isAsyncIteratorObject, SequentialIdGenerator } from '@standardserver/shared'
import { toStandardBody } from './body'
import { sendEventIterator } from './event-stream'
import { sendOctetStream } from './octet-stream'

export interface ClientPeerCloseOptions extends AsyncIdQueueCloseOptions {}

export class ClientPeer {
  private readonly idGenerator = new SequentialIdGenerator()

  /**
   * Messages waiting to be processed
   */
  private readonly responseMessageQueue = new AsyncIdQueue<PeerResponseMessage>()
  private readonly eventStreamMessageQueue = new AsyncIdQueue<PeerEventStreamMessage>()
  private readonly octetStreamMessageQueue = new AsyncIdQueue<PeerOctetStreamMessage>()

  /**
   * Abort controllers for each request
   */
  private readonly controllers = new Map<string, AbortController>()

  /**
   * Cleanup functions invoked when the request/response is closed
   */
  private readonly cleanupFns = new Map<string, (() => void)[]>()

  constructor(
    private readonly send: (message: PeerAbortMessage | PeerRequestMessage | PeerEventStreamMessage | PeerOctetStreamMessage) => Promise<void>,
  ) {
    this.send = async (message) => {
      // only send message if still open
      if (this.controllers.has(message.id)) {
        await send(message)
      }
    }
  }

  /**
   * Use to measure resources usage
   */
  get size(): number {
    return this.responseMessageQueue.length
      + this.eventStreamMessageQueue.length
      + this.octetStreamMessageQueue.length
      + this.controllers.size
      + this.cleanupFns.size
  }

  /**
   * Open a request to allow receiving and sending messages
   */
  private open(id: string, requestSignal: AbortSignal | undefined): AbortSignal {
    requestSignal?.throwIfAborted()

    this.eventStreamMessageQueue.open(id)
    this.octetStreamMessageQueue.open(id)
    this.responseMessageQueue.open(id)

    const controller = new AbortController()
    this.controllers.set(id, controller)

    let abortListener: () => Promise<void>
    requestSignal?.addEventListener('abort', abortListener = async () => {
      try {
        controller.abort(requestSignal.reason)
        await this.send({ id, kind: 'abort' })
      }
      finally {
        this.close({ id, reason: controller.signal.reason })
      }
    })

    const cleanupFns: (() => void)[] = [
      /**
       * Make sure to remove the abort listener when the request/response is closed.
       * Since a signal can be reused for multiple requests, if each request
       * adds listeners without removing them, it can lead to excessive memory usage
       * until the signal is garbage collected.
       */
      () => {
        requestSignal?.removeEventListener('abort', abortListener)
      },
    ]
    this.cleanupFns.set(id, cleanupFns)

    return controller.signal
  }

  /**
   * Send a request to the server peer
   */
  async request(request: StandardRequest): Promise<StandardResponse> {
    const id = this.idGenerator.generate()
    const signal = this.open(id, request.signal)

    try {
      const requestMessage: PeerRequestMessage = {
        id,
        kind: 'request',
        json: {
          ...{ ...request, signal: undefined }, // clone and remove signal from request
          headers: { ...request.headers }, // clone headers
          url: urlToString(request.url),
        },
      }

      if (request.body instanceof ReadableStream) {
        requestMessage.json.body = undefined
        requestMessage.json.headers['standard-server'] = 'octet-stream' satisfies StandardBodyHint
      }
      else if (isAsyncIteratorObject(request.body)) {
        requestMessage.json.body = undefined
        requestMessage.json.headers['standard-server'] = 'event-stream' satisfies StandardBodyHint
      }
      else if (request.body instanceof FormData) {
        const res = new Response(request.body)
        requestMessage.binary = await res.blob()
        requestMessage.json.body = undefined
        requestMessage.json.headers['standard-server'] = 'form-data' satisfies StandardBodyHint
        requestMessage.json.headers['content-type'] = res.headers.get('content-type') ?? undefined
      }
      else if (request.body instanceof Blob) {
        requestMessage.binary = request.body
        requestMessage.json.body = undefined
        requestMessage.json.headers['standard-server'] = 'file' satisfies StandardBodyHint
        requestMessage.json.headers['content-disposition'] = generateContentDisposition(request.body instanceof File ? request.body.name : 'blob')
        requestMessage.json.headers['content-type'] = request.body.type
      }
      else if (request.body instanceof URLSearchParams) {
        requestMessage.json.body = request.body.toString()
        requestMessage.json.headers['standard-server'] = 'url-search-params' satisfies StandardBodyHint
      }

      signal.throwIfAborted()
      /**
       * We must ensure the request is sent before send any additional messages,
       * such as event iterator messages, signal messages, etc.
       * Otherwise, the server may not recognize them as part of the request.
       */
      await this.send(requestMessage)
      signal.throwIfAborted()

      if (isAsyncIteratorObject(request.body)) {
        /**
         * Do not await here; we don't want it to block response processing.
         */
        void sendEventIterator(request.body, id, signal, this.send)
          .catch(async (reason) => {
            try {
              await this.send({ id, kind: 'abort' })
            }
            finally {
              this.close({ id, reason })
            }
          })
      }
      else if (request.body instanceof ReadableStream) {
        /**
         * Do not await here; we don't want it to block response processing.
         */
        void sendOctetStream(request.body, id, signal, this.send)
          .catch(async (reason) => {
            try {
              await this.send({ id, kind: 'abort' })
            }
            finally {
              this.close({ id, reason })
            }
          })
      }

      const peerResponseMessage = await this.responseMessageQueue.pull(id)

      return {
        ...peerResponseMessage.json,
        body: await toStandardBody(
          peerResponseMessage,
          this.eventStreamMessageQueue,
          this.octetStreamMessageQueue,
          async (isCompleted) => {
            try {
              if (!isCompleted) {
                await this.send({ id, kind: 'abort' })
              }
            }
            finally {
              this.close({ id })
            }
          },
        ),
      }
    }
    catch (reason) {
      this.close({ id, reason })
      throw reason
    }
  }

  /**
   * Handle a message from server
   */
  async message(message: PeerResponseMessage | PeerEventStreamMessage | PeerOctetStreamMessage | PeerAbortMessage): Promise<void> {
    if (message.kind === 'abort') {
      this.close({ id: message.id, reason: new AbortError('Server aborted request') })
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

    if (this.responseMessageQueue.isOpen(message.id)) {
      this.responseMessageQueue.push(message.id, message)
    }
  }

  close(options: AsyncIdQueueCloseOptions = {}): void {
    if (options.id !== undefined) {
      this.controllers.get(options.id)?.abort(options.reason)
      this.controllers.delete(options.id)
      this.cleanupFns.get(options.id)?.forEach(fn => fn())
      this.cleanupFns.delete(options.id)
    }
    else {
      this.controllers.forEach(c => c.abort(options.reason))
      this.controllers.clear()
      this.cleanupFns.forEach(fns => fns.forEach(fn => fn()))
      this.cleanupFns.clear()
    }

    this.responseMessageQueue.close(options)
    this.eventStreamMessageQueue.close(options)
    this.octetStreamMessageQueue.close(options)
  }
}
