import type { AsyncCleanupFn } from '@standardserver/shared'
import type { PeerEventStreamMessage } from './types'
import {
  EventIteratorErrorEvent,
  resolveEventIteratorEvent,
  withEventIteratorEventMeta,
} from '@standardserver/core/event-stream'
import { AsyncIteratorClass, isTypescriptObject } from '@standardserver/shared'

/**
 * Creates an AsyncIterator from a queue of peer event-stream messages.
 * The iterator yields normal events, throws error events, and completes on done.
 */
export function toEventIterator(
  pull: () => Promise<PeerEventStreamMessage>,
  cleanup: AsyncCleanupFn,
): AsyncIteratorClass<unknown> {
  return new AsyncIteratorClass(async () => {
    while (true) {
      const { json } = await pull()

      switch (json.event) {
        case 'message': {
          let data = json.data

          if (isTypescriptObject(data)) {
            data = withEventIteratorEventMeta(data, json)
          }

          return { value: data, done: false }
        }

        case 'error': {
          // Error events are surfaced by throwing a special error type
          throw withEventIteratorEventMeta(
            new EventIteratorErrorEvent(json.data),
            json,
          )
        }

        case 'close': {
          let data = json.data

          if (isTypescriptObject(data)) {
            data = withEventIteratorEventMeta(data, json)
          }

          return { value: data, done: true }
        }
      }
    }
  }, cleanup)
}

/**
 * Consumes an AsyncIterator and forwards its output as peer event-stream messages.
 * Iterator completion, error events, and abort signals are mapped explicitly.
 */
export async function sendEventIterator(
  iterator: AsyncIterator<unknown>,
  messageId: string,
  signal: AbortSignal | undefined,
  send: (message: PeerEventStreamMessage) => Promise<void>,
): Promise<void> {
  signal?.throwIfAborted()

  let completed = false

  const handleAbort = async () => {
    if (!completed) {
      completed = true
      await iterator.return?.()
    }
  }

  signal?.addEventListener('abort', handleAbort, { once: true })

  while (true) {
    const json: PeerEventStreamMessage['json'] = await (async () => {
      try {
        const { value, done } = await iterator.next()
        const [data, meta] = resolveEventIteratorEvent(value)

        if (done) {
          completed = true
          signal?.removeEventListener('abort', handleAbort)
        }

        return {
          ...meta,
          event: done ? 'close' : 'message',
          data,
        }
      }
      catch (err) {
        completed = true
        signal?.removeEventListener('abort', handleAbort)

        /**
         * Error events are part of the protocol and should not be treated
         * as iterator failures.
         */
        if (err instanceof EventIteratorErrorEvent) {
          const [resolvedError, meta] = resolveEventIteratorEvent(err)

          return {
            ...meta,
            event: 'error',
            data: resolvedError.data,
          }
        }

        throw err
      }
    })()

    try {
      if (!signal?.aborted) {
        await send({ json, kind: 'event-stream', id: messageId })
      }
    }
    catch (err) {
      if (!completed) {
        completed = true
        signal?.removeEventListener('abort', handleAbort)
        await iterator.return?.()
      }

      throw err
    }

    if (completed) {
      return
    }
  }
}
