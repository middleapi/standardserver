import type { AsyncCleanupFn, Queue } from '@standardserver/shared'
import type { PeerEventStreamMessage } from './types'
import {
  EventIteratorErrorEvent,
  unwrapEventIteratorEvent,
  withEventIteratorEventMeta,
} from '@standardserver/core'
import { AsyncIteratorClass, isTypescriptObject } from '@standardserver/shared'

/**
 * Creates an AsyncIterator from a queue of peer event-stream messages.
 * The iterator yields normal events, throws error events, and completes on done.
 */
export function toEventIterator(
  queue: Queue<PeerEventStreamMessage>,
  cleanup: AsyncCleanupFn,
): AsyncIteratorClass<unknown> {
  return new AsyncIteratorClass(async () => {
    while (true) {
      const { json } = await queue.pull()

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
  ) {
  }

  async cancel(): Promise<void> {
    if (!this.isCompleted) {
      this.isCompleted = true
      await this.iterator.return?.()
    }
  }

  async transmit(): Promise<void> {
    while (true) {
      try {
        const item = await this.iterator.next()

        if (this.isCompleted) {
          return
        }

        const [data, meta] = unwrapEventIteratorEvent(item.value)

        try {
          await this.send({
            kind: 'event-stream',
            id: this.messageId,
            json: { ...meta, event: item.done ? 'close' : 'message', data },
          })
        }
        catch (error) {
          if (!item.done) {
            // only need cancel if iterator hasn't finished yet
            await this.cancel()
          }

          throw error
        }

        if (item.done) {
          this.isCompleted = true
          return
        }
      }
      catch (error) {
        if (this.isCompleted) {
          throw error
        }

        /**
         * Error events are part of the protocol and should not be treated
         * as iterator failures.
         */
        if (error instanceof EventIteratorErrorEvent) {
          const [resolvedError, meta] = unwrapEventIteratorEvent(error)

          await this.send({
            kind: 'event-stream',
            id: this.messageId,
            json: { ...meta, event: 'error', data: resolvedError.data },
          })

          this.isCompleted = true
          return
        }
        else {
          this.isCompleted = true
          throw error
        }
      }
    }
  }
}
