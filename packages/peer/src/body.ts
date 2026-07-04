import type { StandardBody, StandardBodyHint, StandardHeaders } from '@standardserver/core'
import type { AsyncCleanupFn } from '@standardserver/shared'
import type { PeerEventStreamMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage } from './types'
import { flattenStandardHeader, generateContentDisposition, getFilenameFromContentDisposition } from '@standardserver/core'
import { isAsyncIteratorObject, Queue } from '@standardserver/shared'
import { toAsyncIteratorObject } from './event-stream'
import { toOctetStream } from './octet-stream'

export interface ToStandardBodyResult {
  resolveBody: () => Promise<StandardBody>
  eventStreamMessageQueue?: Queue<PeerEventStreamMessage>
  octetStreamMessageQueue?: Queue<PeerOctetStreamMessage>
}

export function toStandardBody(
  message: PeerRequestMessage | PeerResponseMessage,
  cleanup: AsyncCleanupFn,
): ToStandardBodyResult {
  const bodyHint = flattenStandardHeader(message.json.headers['standard-server'])

  if (bodyHint === 'event-stream' satisfies StandardBodyHint) {
    const eventStreamMessageQueue = new Queue<PeerEventStreamMessage>()
    return {
      resolveBody: async () => toAsyncIteratorObject(eventStreamMessageQueue, cleanup),
      eventStreamMessageQueue,
    }
  }

  if (bodyHint === 'octet-stream' satisfies StandardBodyHint) {
    const octetStreamMessageQueue = new Queue<PeerOctetStreamMessage>()
    return {
      resolveBody: async () => toOctetStream(octetStreamMessageQueue, cleanup),
      octetStreamMessageQueue,
    }
  }

  const resolveBody = async () => {
    let errorRef: { value: unknown } | undefined

    try {
      if (bodyHint === 'file' satisfies StandardBodyHint) {
        const contentDisposition = flattenStandardHeader(message.json.headers['content-disposition'])
        const filename = contentDisposition !== undefined
          ? getFilenameFromContentDisposition(contentDisposition)
          : undefined

        const body = new File(message.binary ? [message.binary] : [], filename ?? 'blob', {
          type: flattenStandardHeader(message.json.headers['content-type']) ?? 'application/octet-stream',
        })
        return body
      }

      if (bodyHint === 'form-data' satisfies StandardBodyHint) {
        const res = new Response(message.binary, {
          headers: {
            'content-type': flattenStandardHeader(message.json.headers['content-type']) ?? 'multipart/form-data',
          },
        })

        const body = await res.formData()
        return body
      }

      if (bodyHint === 'url-search-params' satisfies StandardBodyHint && typeof message.json.body === 'string') {
        return new URLSearchParams(message.json.body)
      }

      return message.json.body
    }
    catch (error) {
      errorRef = { value: error }
      throw error
    }
    finally {
    // The body is fully loaded, so we can clean up immediately.
      await cleanup(errorRef ? { kind: 'error', error: errorRef.value } : { kind: 'success' })
    }
  }

  return { resolveBody }
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
