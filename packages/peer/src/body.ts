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

/**
 * Parse a peer message body.
 */
export function toStandardBody(
  message: PeerRequestMessage | PeerResponseMessage,
  cleanup: AsyncCleanupFn,
): ToStandardBodyResult {
  const bodyHint = message.json.bodyHint

  if (bodyHint === 'event-stream') {
    const eventStreamMessageQueue = new Queue<PeerEventStreamMessage>()
    return {
      resolveBody: async () => toAsyncIteratorObject(eventStreamMessageQueue, cleanup),
      eventStreamMessageQueue,
    }
  }

  if (bodyHint === 'octet-stream') {
    const octetStreamMessageQueue = new Queue<PeerOctetStreamMessage>()
    return {
      resolveBody: async () => toOctetStream(octetStreamMessageQueue, cleanup),
      octetStreamMessageQueue,
    }
  }

  const resolveBody = async () => {
    let errorRef: { value: unknown } | undefined

    try {
      if (bodyHint === 'url-search-params') {
        if (typeof message.json.body !== 'string') {
          throw new TypeError('Expected body to be a string for url-search-params bodyHint')
        }

        return new URLSearchParams(message.json.body)
      }

      if (bodyHint === 'form-data') {
        const res = new Response(message.binary, {
          headers: {
            'content-type': flattenStandardHeader(message.json.headers['content-type']) ?? 'multipart/form-data',
          },
        })

        const form = await res.formData()
        return form
      }

      if (bodyHint === 'file') {
        const contentDisposition = flattenStandardHeader(message.json.headers['content-disposition'])
        const filename = contentDisposition !== undefined
          ? getFilenameFromContentDisposition(contentDisposition)
          : undefined

        const file = new File(message.binary ? [message.binary] : [], filename ?? 'blob', {
          type: flattenStandardHeader(message.json.headers['content-type']) ?? 'application/octet-stream',
        })
        return file
      }

      if (bodyHint === 'none') {
        return undefined
      }

      const _expect: 'json' = bodyHint
      return message.json.body // json body already parsed
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

export interface EncodedAtomicStandardBody {
  bodyHint: StandardBodyHint
  jsonBody: unknown
  headers: StandardHeaders
  binary: Uint8Array<ArrayBuffer> | Blob | undefined
}

/**
 * Encode a `StandardBody` into JSON, binary data, and headers.
 * Event and octet streams are handled separately.
 *
 * Unlike HTTP adapters, peer adapter do not use a `standard-server` header,
 * because receivers must parse the body as sent. so we need a explicit `bodyHint` to indicate how the body is sent.
 */
export async function encodeAtomicStandardBody(
  body: StandardBody,
  headers: StandardHeaders,
): Promise<EncodedAtomicStandardBody> {
  headers = { ...headers }

  if (body instanceof ReadableStream) {
    return { bodyHint: 'octet-stream', jsonBody: undefined, headers, binary: undefined }
  }

  if (body instanceof Blob) {
    headers['content-type'] = body.type
    headers['content-disposition'] ??= generateContentDisposition(
      body instanceof File ? body.name : 'blob',
    )

    // BunS3 can use NaN for the size
    if (!Number.isNaN(body.size)) {
      headers['content-length'] = body.size.toString()
    }

    return { bodyHint: 'file', jsonBody: undefined, headers, binary: body }
  }

  if (isAsyncIteratorObject(body)) {
    return { bodyHint: 'event-stream', jsonBody: undefined, headers, binary: undefined }
  }

  if (body instanceof FormData) {
    const res = new Response(body)
    const blob = await res.blob()
    headers['content-type'] = res.headers.get('content-type')!
    headers['content-length'] = blob.size.toString()

    return { bodyHint: 'form-data', jsonBody: undefined, headers, binary: blob }
  }

  if (body instanceof URLSearchParams) {
    return { bodyHint: 'url-search-params', jsonBody: body.toString(), headers, binary: undefined }
  }

  if (body === undefined) {
    return { bodyHint: 'none', jsonBody: undefined, headers, binary: undefined }
  }

  return { bodyHint: 'json', jsonBody: body, headers, binary: undefined }
}
