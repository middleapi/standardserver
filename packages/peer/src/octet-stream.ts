import type { AsyncCleanupFn, Queue } from '@standardserver/shared'
import type { PeerOctetStreamMessage } from './types'

/**
 * Creates an AsyncIterator from a queue of peer octet-stream messages.
 * The iterator yields binary chunks on 'enqueue', and completes on 'close'.
 */
export function toOctetStream(
  queue: Queue<PeerOctetStreamMessage>,
  cleanup: AsyncCleanupFn,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream({
    async pull(controller) {
      try {
        const { json, binary } = await queue.pull()

        if (binary) {
          controller.enqueue(binary instanceof Uint8Array ? binary : new Uint8Array(await binary.arrayBuffer()))
        }

        if (json.close) {
          await cleanup({ kind: 'success' })
          controller.close()
        }
      }
      catch (error) {
        await cleanup({ kind: 'error', error })
        controller.error(error)
      }
    },
    async cancel(error) {
      await cleanup({ kind: 'cancelled', error })
    },
  })
}

/**
 * Transmits binary chunks to a peer octet-stream.
 */
export class OctetStreamTransmitter {
  private isCompleted = false
  private readonly reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>

  constructor(
    stream: ReadableStream<Uint8Array<ArrayBuffer>>,
    private readonly messageId: string,
    private readonly send: (message: PeerOctetStreamMessage) => Promise<void>,
  ) {
    this.reader = stream.getReader()
  }

  async cancel(): Promise<void> {
    if (!this.isCompleted) {
      this.isCompleted = true
      await this.reader.cancel()
    }
  }

  async transmit(): Promise<void> {
    while (true) {
      try {
        const { done, value } = await this.reader.read()

        if (this.isCompleted) {
          return
        }

        try {
          await this.send({
            json: { close: done },
            binary: value,
            kind: 'octet-stream',
            id: this.messageId,
          })
        }
        catch (err) {
          if (!done) {
            // only need cancel if stream hasn't finished yet
            await this.cancel()
          }

          throw err
        }

        if (done) {
          this.isCompleted = true
          return
        }
      }
      catch (error) {
        this.isCompleted = true
        throw error
      }
    }
  }
}
