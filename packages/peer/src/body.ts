import type { StandardBody, StandardBodyHint } from '@standardserver/core'
import type { AsyncCleanupFn, AsyncIdQueue } from '@standardserver/shared'
import type { PeerEventStreamMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage } from './types'
import { flattenStandardHeader, getFilenameFromContentDisposition } from '@standardserver/core'
import { toEventIterator } from './event-stream'
import { toOctetStream } from './octet-stream'

export async function toStandardBody(
  message: PeerRequestMessage | PeerResponseMessage,
  eventStreamMessageQueue: AsyncIdQueue<PeerEventStreamMessage>,
  octetStreamMessageQueue: AsyncIdQueue<PeerOctetStreamMessage>,
  cleanup: AsyncCleanupFn,
): Promise<StandardBody> {
  const bodyHint = flattenStandardHeader(message.json.headers['standard-server'])

  if (bodyHint === 'event-stream' satisfies StandardBodyHint) {
    return toEventIterator(
      () => eventStreamMessageQueue.pull(message.id),
      cleanup,
    )
  }

  if (bodyHint === 'octet-stream' satisfies StandardBodyHint) {
    return toOctetStream(
      () => octetStreamMessageQueue.pull(message.id),
      cleanup,
    )
  }

  try {
    if (bodyHint === 'file' satisfies StandardBodyHint) {
      const contentDisposition = flattenStandardHeader(message.json.headers['content-disposition'])
      const filename = contentDisposition !== undefined
        ? getFilenameFromContentDisposition(contentDisposition)
        : 'undefined'

      return new File(message.binary ? [message.binary] : [], filename ?? 'blob', {
        type: flattenStandardHeader(message.json.headers['content-type']) ?? 'application/octet-stream',
      })
    }

    if (bodyHint === 'form-data' satisfies StandardBodyHint) {
      const res = new Response(message.binary, {
        headers: {
          'content-type': flattenStandardHeader(message.json.headers['content-type']) ?? 'multipart/form-data',
        },
      })

      const fromData = await res.formData()
      return fromData
    }

    if (bodyHint === 'url-search-params' satisfies StandardBodyHint && typeof message.json.body === 'string') {
      return new URLSearchParams(message.json.body)
    }

    return message.json.body
  }
  finally {
    // The body is fully loaded, so we can clean up immediately.
    await cleanup(true)
  }
}
