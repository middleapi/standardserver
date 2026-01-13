import type { StandardBody, StandardBodyHint, StandardHeaders } from '@standardserver/core'
import type { AsyncCleanupFn, AsyncIdQueue } from '@standardserver/shared'
import type { PeerEventStreamMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage } from './types'
import { flattenStandardHeader, generateContentDisposition, getFilenameFromContentDisposition } from '@standardserver/core'
import { isAsyncIteratorObject } from '@standardserver/shared'
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

export async function encodeAtomicStandardBody(
  body: StandardBody,
  headers: StandardHeaders,
): Promise<[
  jsonBody: unknown,
  headers: StandardHeaders,
  binary: Uint8Array<ArrayBuffer> | Blob | undefined,
]> {
  headers = { ...headers } // clone
  let binary: Uint8Array<ArrayBuffer> | Blob | undefined

  let jsonBody = body
  // Default the body hint to indicate JSON or an empty body.
  headers['standard-server'] = undefined

  if (body instanceof ReadableStream) {
    jsonBody = undefined
    headers['standard-server'] = 'octet-stream' satisfies StandardBodyHint
  }
  else if (isAsyncIteratorObject(body)) {
    jsonBody = undefined
    headers['standard-server'] = 'event-stream' satisfies StandardBodyHint
  }
  else if (body instanceof FormData) {
    const res = new Response(body)
    binary = await res.blob()
    jsonBody = undefined
    headers['standard-server'] = 'form-data' satisfies StandardBodyHint
    headers['content-type'] ??= res.headers.get('content-type')!
  }
  else if (body instanceof Blob) {
    binary = body
    jsonBody = undefined
    headers['standard-server'] = 'file' satisfies StandardBodyHint
    headers['content-disposition'] ??= generateContentDisposition(
      body instanceof File ? body.name : 'blob',
    )
    headers['content-type'] ??= body.type
  }
  else if (body instanceof URLSearchParams) {
    jsonBody = body.toString()
    headers['standard-server'] = 'url-search-params' satisfies StandardBodyHint
  }

  return [jsonBody, headers, binary]
}
