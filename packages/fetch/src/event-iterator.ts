import { encodeEventMessage, ErrorEvent, EventDecoderStream, getEventMeta, withEventMeta } from '@standardserver/core/event-iterator'
import { AbortError, AsyncIteratorClass, isTypescriptObject, parseEmptyableJSON, stringifyJSON } from '@standardserver/shared'

export function toEventIterator(
  stream: ReadableStream<Uint8Array<ArrayBuffer>> | null,
): AsyncIteratorClass<unknown> {
  const eventStream = stream
    ?.pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventDecoderStream())

  const reader = eventStream?.getReader()
  let isCancelled = false

  return new AsyncIteratorClass(async () => {
    while (true) {
      if (reader === undefined) {
        return { done: true, value: undefined }
      }

      const { done, value } = await reader.read()

      /**
       * Handle stream completion scenarios:
       *
       * 1. If the reader is cancelled while waiting for the next value,
       *    reader.read() will resolve as { done: true, value: undefined }.
       *    However, this behavior is unreliable and we should only resolve
       *    a value when the sender explicitly indicates completion.
       *
       * 2. The only implicit behavior we allow is when the sender successfully
       *    closes the stream without sending a 'close' event - in this case,
       *    we resolve with { done: true, value: undefined }.
       */
      if (done) {
        if (isCancelled) {
          throw new AbortError('Stream was cancelled')
        }

        return { done: true, value: undefined }
      }

      switch (value.event) {
        case 'message': {
          let message = parseEmptyableJSON(value.data)

          if (isTypescriptObject(message)) {
            message = withEventMeta(message, value)
          }

          return { done: false, value: message }
        }

        case 'error': {
          let error = new ErrorEvent(parseEmptyableJSON(value.data))

          error = withEventMeta(error, value)

          throw error
        }

        case 'close': {
          let close = parseEmptyableJSON(value.data)

          if (isTypescriptObject(close)) {
            close = withEventMeta(close, value)
          }

          return { done: true, value: close }
        }
      }
    }
  }, async (reason) => {
    if (reason !== 'next') {
      isCancelled = true
    }

    await reader?.cancel()
  })
}

export interface ToEventStreamOptions {
  /**
   * If true, a ping comment is sent periodically to keep the connection alive.
   *
   * @default true
   */
  keepAliveEnabled?: boolean

  /**
   * Interval (in milliseconds) between ping comments sent after the last event.
   *
   * @default 5000
   */
  keepAliveInterval?: number

  /**
   * The content of the ping comment. Must not include newline characters.
   *
   * @default ''
   */
  keepAliveComment?: string

  /**
   * If true, an initial comment is sent immediately upon stream start to flush headers.
   * This allows the receiving side to establish the connection without waiting for the first event.
   *
   * @default true
   */
  initialCommentEnabled?: boolean

  /**
   * The content of the initial comment sent upon stream start. Must not include newline characters.
   *
   * @default ''
   */
  initialComment?: string

  /**
   * If false, a 'close' event is only sent if the iterator returns a non-empty value (undefined).
   * By default, a 'close' event is always sent when the iterator completes.
   *
   * @default true
   */
  alwaysSendCloseEvent?: boolean
}

export function toEventStream(
  iterator: AsyncIterator<unknown | void, unknown | void, void>,
  options: ToEventStreamOptions = {},
): ReadableStream<Uint8Array<ArrayBuffer>> {
  const keepAliveEnabled = options.keepAliveEnabled ?? true
  const keepAliveInterval = options.keepAliveInterval ?? 5000
  const keepAliveComment = options.keepAliveComment ?? ''
  const initialCommentEnabled = options.initialCommentEnabled ?? true
  const initialComment = options.initialComment ?? ''
  const alwaysSendCloseEvent = options.alwaysSendCloseEvent ?? true

  let cancelled = false
  let timeout: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<string>({
    start(controller) {
      if (initialCommentEnabled) {
        controller.enqueue(encodeEventMessage({
          comments: [initialComment],
        }))
      }
    },
    async pull(controller) {
      try {
        if (keepAliveEnabled) {
          timeout = setInterval(() => {
            controller.enqueue(encodeEventMessage({
              comments: [keepAliveComment],
            }))
          }, keepAliveInterval)
        }

        const value = await iterator.next()

        clearInterval(timeout)

        if (cancelled) {
          return
        }

        const meta = getEventMeta(value.value)

        if (alwaysSendCloseEvent || !value.done || value.value !== undefined || meta !== undefined) {
          const event = value.done ? 'close' : 'message'
          controller.enqueue(encodeEventMessage({
            ...meta,
            event,
            data: stringifyJSON(value.value),
          }))
        }

        if (value.done) {
          controller.close()
        }
      }
      catch (err) {
        clearInterval(timeout)

        if (cancelled) {
          return
        }

        if (err instanceof ErrorEvent) {
          controller.enqueue(encodeEventMessage({
            ...getEventMeta(err),
            event: 'error',
            data: stringifyJSON(err.data),
          }))
          controller.close()
        }
        else {
          /**
           * Should treat a non-ErrorEvent as an error.
           */
          controller.error(err)
        }
      }
    },
    async cancel() {
      cancelled = true
      clearInterval(timeout)

      await iterator.return?.()
    },
  }).pipeThrough(new TextEncoderStream())

  return stream
}
