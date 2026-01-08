import type { AsyncCleanupFn } from '@standardserver/shared'
import type { PeerOctetStreamMessage } from './types'

/**
 * Creates an AsyncIterator from a queue of peer octet-stream messages.
 * The iterator yields binary chunks on 'enqueue', and completes on 'close'.
 */
export function toOctetStream(
  pull: () => Promise<PeerOctetStreamMessage>,
  cleanup: AsyncCleanupFn,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream({
    async pull(controller) {
      try {
        const { json, binary } = await pull()

        if (binary) {
          controller.enqueue(binary instanceof Uint8Array ? binary : new Uint8Array(await binary.arrayBuffer()))
        }

        if (json.close) {
          await cleanup(true)
          controller.close()
        }
      }
      catch (err) {
        await cleanup(true)
        controller.error(err)
      }
    },
    async cancel() {
      await cleanup(false)
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
      const { done, value } = await this.reader.read()

      if (!this.isCompleted) {
        try {
          await this.send({
            json: { close: done },
            binary: value,
            kind: 'octet-stream',
            id: this.messageId,
          })
        }
        catch (err) {
          await this.cancel()
          throw err
        }
      }

      if (done) {
        this.isCompleted = true
        break
      }
    }
  }
}
