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

        if (json.end) {
          await cleanup(true)
          controller.close()
        }
      }
      catch (err) {
        await cleanup(false)
        controller.error(err)
      }
    },
    async cancel() {
      await cleanup(false)
    },
  })
}

/**
 * Consumes an AsyncIterator of binary chunks and forwards its output as peer octet-stream messages.
 * Iterator completion and abort signals are mapped explicitly.
 */
export async function sendOctetStream(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  messageId: string,
  signal: AbortSignal | undefined,
  send: (message: PeerOctetStreamMessage) => Promise<void>,
): Promise<void> {
  signal?.throwIfAborted()

  const reader = stream.getReader()

  let completed = false

  const handleAbort = async () => {
    if (!completed) {
      completed = true
      await reader.cancel?.()
    }
  }

  signal?.addEventListener('abort', handleAbort, { once: true })

  while (true) {
    let binary: Uint8Array<ArrayBuffer> | undefined
    let done: boolean

    try {
      const result = await reader.read()

      binary = result.value
      done = result.done

      if (done) {
        completed = true
        signal?.removeEventListener('abort', handleAbort)
      }
    }
    catch (err) {
      if (!completed) {
        completed = true
        signal?.removeEventListener('abort', handleAbort)
      }

      throw err
    }

    try {
      if (!signal?.aborted) {
        await send({
          json: { end: done ? true : undefined },
          binary,
          kind: 'octet-stream',
          id: messageId,
        })
      }
    }
    catch (err) {
      if (!completed) {
        completed = true
        signal?.removeEventListener('abort', handleAbort)
        await reader.cancel?.()
      }

      throw err
    }

    if (completed) {
      return
    }
  }
}
