import type { AsyncCleanupFn } from '@standardserver/shared'
import type { PeerEventStreamMessage } from './types'
import {
  EventIteratorErrorEvent,
  unwrapEventIteratorEvent,
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
 * Transmits events to a peer event-stream.
 */
export class EventStreamTransmitter {
  private isCompleted = false

  constructor(
    private readonly iterator: AsyncIterator<unknown>,
    private readonly messageId: string,
    private readonly send: (message: PeerEventStreamMessage) => Promise<void>,
  ) {}

  async cancel(): Promise<void> {
    if (!this.isCompleted) {
      this.isCompleted = true
      await this.iterator.return?.()
    }
  }

  async transmit(): Promise<void> {
    while (true) {
      let json: PeerEventStreamMessage['json']

      try {
        const item = await this.iterator.next()

        // DON'T send message if cancelled or completed before
        if (this.isCompleted) {
          return
        }

        if (item.done) {
          this.isCompleted = true
        }

        const [data, meta] = unwrapEventIteratorEvent(item.value)
        json = { ...meta, event: item.done ? 'close' : 'message', data }
      }
      catch (err) {
        /**
         * Error events are part of the protocol and should not be treated
         * as iterator failures.
         */
        if (err instanceof EventIteratorErrorEvent) {
          // DON'T send message if cancelled or completed before
          if (this.isCompleted) {
            return
          }

          this.isCompleted = true

          const [resolvedError, meta] = unwrapEventIteratorEvent(err)
          json = { ...meta, event: 'error', data: resolvedError.data }
        }
        else {
          this.isCompleted = true
          throw err
        }
      }

      await this.send({
        json,
        kind: 'event-stream',
        id: this.messageId,
      })

      if (this.isCompleted) {
        return
      }
    }
  }
}
