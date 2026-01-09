import type { StandardBodyHint, StandardRequest, StandardResponse } from '@standardserver/core'
import type { AsyncIdQueueCloseOptions } from '@standardserver/shared'
import type { PeerAbortMessage, PeerEventStreamMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage, PeerStreamCancelMessage } from './types'
import { generateContentDisposition, urlToString } from '@standardserver/core'
import { AbortError, AsyncIdQueue, isAsyncIteratorObject, SequentialIdGenerator } from '@standardserver/shared'
import { toStandardBody } from './body'
import { EventStreamTransmitter } from './event-stream'
import { OctetStreamTransmitter } from './octet-stream'

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
   * Transmitters for event streams and octet streams
   * Should be cancelled when needed
   */
  private readonly requestEventStreamTransmitters = new Map<string, EventStreamTransmitter>()
  private readonly requestOctetStreamTransmitters = new Map<string, OctetStreamTransmitter>()

  /**
   * Cleanup functions invoked when the request/response is completed
   */
  private readonly cleanupFns = new Map<string, (() => void)[]>()

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
    return this.responseMessageQueue.length
      + this.eventStreamMessageQueue.length
      + this.octetStreamMessageQueue.length
      + this.requestEventStreamTransmitters.size
      + this.requestOctetStreamTransmitters.size
      + this.cleanupFns.size
  }

  /**
   * Send a request to the server peer
   */
  async request(request: StandardRequest): Promise<StandardResponse> {
    const signal = request.signal
    signal?.throwIfAborted()

    const id = this.idGenerator.generate()

    this.eventStreamMessageQueue.open(id)
    this.octetStreamMessageQueue.open(id)
    this.responseMessageQueue.open(id)

    let abortListener: () => Promise<void>
    signal?.addEventListener('abort', abortListener = async () => {
      await Promise.all([
        /**
         * Let server know request was aborted
         *
         * We don't need to check if is there any abort message already sent
         * since this listener is removed when the request is closed.
         */
        this.send({ id, kind: 'abort' }),
        this.close({ id, reason: signal.reason }),
      ])
    })

    const cleanupFns: (() => void)[] = [
      /**
       * Make sure to remove the abort listener when the request/response is closed.
       * Since a signal can be reused for multiple requests, if each request
       * adds listeners without removing them, it can lead to excessive memory usage
       * until the signal is garbage collected.
       */
      () => {
        signal?.removeEventListener('abort', abortListener)
      },
    ]
    this.cleanupFns.set(id, cleanupFns)

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

      signal?.throwIfAborted()
      /**
       * We must ensure the request is sent before send any additional messages,
       * such as event iterator messages, signal messages, etc.
       * Otherwise, the server may not recognize them as part of the request.
       */
      await this.send(requestMessage)
      signal?.throwIfAborted()

      if (isAsyncIteratorObject(request.body)) {
        const transmitter = new EventStreamTransmitter(request.body, id, this.send)
        this.requestEventStreamTransmitters.set(id, transmitter)

        /**
         * Do not await here; we don't want it to block response processing.
         */
        void transmitter.transmit().catch(async (reason) => {
          await Promise.all([
            /**
             * We don't need to send abort message if transmitter was cancelled
             * or request was aborted
             */
            this.requestEventStreamTransmitters.has(id) ? this.send({ id, kind: 'abort' }) : undefined,
            this.close({ id, reason }),
          ])
        })
      }
      else if (request.body instanceof ReadableStream) {
        const transmitter = new OctetStreamTransmitter(request.body, id, this.send)
        this.requestOctetStreamTransmitters.set(id, transmitter)

        /**
         * Do not await here; we don't want it to block response processing.
         */
        void transmitter.transmit().catch(async (reason) => {
          await Promise.all([
            /**
             * We don't need to send abort message if transmitter was cancelled
             * or request was aborted
             */
            this.requestOctetStreamTransmitters.has(id) ? this.send({ id, kind: 'abort' }) : undefined,
            this.close({ id, reason }),
          ])
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
            await Promise.all([
              /**
               * We don't need to send abort message if completed
               * or request was aborted
               */
              !isCompleted && (this.eventStreamMessageQueue.isOpen(id) || this.octetStreamMessageQueue.isOpen(id))
                ? this.send({ id, kind: 'abort' })
                : undefined,
              this.close({ id }),
            ])
          },
        ),
      }
    }
    catch (reason) {
      await this.close({ id, reason })
      throw reason
    }
  }

  /**
   * Handle a message from server
   */
  async message(
    message: PeerResponseMessage | PeerAbortMessage | PeerEventStreamMessage | PeerOctetStreamMessage | PeerStreamCancelMessage,
  ): Promise<void> {
    if (message.kind === 'stream/cancel') {
      const promise = Promise.all([
        this.requestEventStreamTransmitters.get(message.id)?.cancel(),
        this.requestOctetStreamTransmitters.get(message.id)?.cancel(),
      ])

      this.requestEventStreamTransmitters.delete(message.id)
      this.requestOctetStreamTransmitters.delete(message.id)

      await promise

      return
    }

    if (message.kind === 'abort') {
      await this.close({ id: message.id, reason: new AbortError('Server peer aborted the request') })
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

  async close(options: AsyncIdQueueCloseOptions = {}): Promise<void> {
    const promises: (Promise<void> | undefined)[] = []

    this.responseMessageQueue.close(options)
    this.eventStreamMessageQueue.close(options)
    this.octetStreamMessageQueue.close(options)

    if (options.id !== undefined) {
      promises.push(
        this.requestEventStreamTransmitters.get(options.id)?.cancel(),
        this.requestOctetStreamTransmitters.get(options.id)?.cancel(),
      )

      this.requestEventStreamTransmitters.delete(options.id)
      this.requestOctetStreamTransmitters.delete(options.id)

      this.cleanupFns.get(options.id)?.forEach(fn => fn())
      this.cleanupFns.delete(options.id)
    }
    else {
      this.requestEventStreamTransmitters.forEach(t => promises.push(t.cancel()))
      this.requestOctetStreamTransmitters.forEach(t => promises.push(t.cancel()))

      this.requestEventStreamTransmitters.clear()
      this.requestOctetStreamTransmitters.clear()

      this.cleanupFns.forEach(fns => fns.forEach(fn => fn()))
      this.cleanupFns.clear()
    }

    await Promise.all(promises)
  }
}
