import { encodeEventStreamMessage, EventIteratorErrorEvent, EventStreamDecoderStream, getEventIteratorEventMeta, unwrapEventIteratorEvent, withEventIteratorEventMeta } from '@standardserver/core/event-stream'
import { AbortError, AsyncIteratorClass, isTypescriptObject, parseEmptyableJSON, stringifyJSON } from '@standardserver/shared'

export function toEventIterator(
  stream: ReadableStream<Uint8Array<ArrayBuffer>> | null,
): AsyncIteratorClass<unknown> {
  const eventStream = stream
    ?.pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventStreamDecoderStream())

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
            message = withEventIteratorEventMeta(message, value)
          }

          return { done: false, value: message }
        }

        case 'error': {
          let error = new EventIteratorErrorEvent(parseEmptyableJSON(value.data))

          error = withEventIteratorEventMeta(error, value)

          throw error
        }

        case 'close': {
          let close = parseEmptyableJSON(value.data)

          if (isTypescriptObject(close)) {
            close = withEventIteratorEventMeta(close, value)
          }

          return { done: true, value: close }
        }
      }
    }
  }, async (state) => {
    if (state.isCancelled) {
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
   * If true, no `close` event is sent when the iterator completes with `undefined`.
   *
   * @default true
   */
  omitEmptyCloseEvent?: boolean
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
  const omitEmptyCloseEvent = options.omitEmptyCloseEvent ?? true

  let cancelled = false
  let timeout: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<string>({
    start(controller) {
      if (initialCommentEnabled) {
        controller.enqueue(encodeEventStreamMessage({
          comments: [initialComment],
        }))
      }
    },
    async pull(controller) {
      try {
        if (keepAliveEnabled) {
          timeout = setInterval(() => {
            controller.enqueue(encodeEventStreamMessage({
              comments: [keepAliveComment],
            }))
          }, keepAliveInterval)
        }

        const result = await iterator.next()

        clearInterval(timeout)

        if (cancelled) {
          return
        }

        const [data, meta] = unwrapEventIteratorEvent(result.value)

        if (!omitEmptyCloseEvent || !result.done || data !== undefined || meta !== undefined) {
          const event = result.done ? 'close' : 'message'
          controller.enqueue(encodeEventStreamMessage({
            ...meta,
            event,
            data: stringifyJSON(data),
          }))
        }

        if (result.done) {
          controller.close()
        }
      }
      catch (err) {
        clearInterval(timeout)

        if (cancelled) {
          return
        }

        if (err instanceof EventIteratorErrorEvent) {
          controller.enqueue(encodeEventStreamMessage({
            ...getEventIteratorEventMeta(err),
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
