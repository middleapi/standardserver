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
 *
 * For broad compatibility with other peer implementations,
 * this function follows HTTP adapter behavior and handles all body shapes,
 * not just those produced by {@link encodeAtomicStandardBody}.
 */
export function toStandardBody(
  message: PeerRequestMessage | PeerResponseMessage,
  cleanup: AsyncCleanupFn,
): ToStandardBodyResult {
  const bodyHint = flattenStandardHeader(message.json.headers['standard-server'])
  const mimeType = flattenStandardHeader(message.json.headers['content-type'])?.split(';')[0]?.trim()

  if (message.json.body === undefined && message.binary === undefined) {
    if (
      bodyHint === 'event-stream' satisfies StandardBodyHint
      || (bodyHint === undefined && mimeType === 'text/event-stream')
    ) {
      const eventStreamMessageQueue = new Queue<PeerEventStreamMessage>()
      return {
        resolveBody: async () => toAsyncIteratorObject(eventStreamMessageQueue, cleanup),
        eventStreamMessageQueue,
      }
    }

    if (
      bodyHint === 'octet-stream' satisfies StandardBodyHint
      // if mineType is not present, the parsed body should be `undefined`
      // if content-length is present, the parsed body should be a blob/file
      || (bodyHint === undefined && mimeType !== undefined && flattenStandardHeader(message.json.headers['content-length']) === undefined)
    ) {
      const octetStreamMessageQueue = new Queue<PeerOctetStreamMessage>()
      return {
        resolveBody: async () => toOctetStream(octetStreamMessageQueue, cleanup),
        octetStreamMessageQueue,
      }
    }
  }

  const resolveBody = async () => {
    let errorRef: { value: unknown } | undefined

    try {
      if (
        ((bodyHint === 'url-search-params' satisfies StandardBodyHint)
          || (bodyHint === undefined && mimeType === 'application/x-www-form-urlencoded'))
        && typeof message.json.body === 'string'
      ) {
        return new URLSearchParams(message.json.body)
      }

      if (
        (bodyHint === 'none' satisfies StandardBodyHint)
        // Prefer a binary body over an undefined body when message.binary is present.
        || (bodyHint === undefined && mimeType === undefined && message.json.body === undefined && message.binary === undefined)
      ) {
        return undefined
      }

      // Keep validation minimal here.
      // If message.json.body exists and does not match a non-binary type above,
      // treat it as JSON and return it directly.
      if (message.json.body !== undefined) {
        return message.json.body // json body already parsed
      }

      if (
        (bodyHint === 'form-data' satisfies StandardBodyHint)
        || (bodyHint === undefined && mimeType === 'multipart/form-data')
      ) {
        const res = new Response(message.binary, {
          headers: {
            'content-type': flattenStandardHeader(message.json.headers['content-type']) ?? 'multipart/form-data',
          },
        })

        const body = await res.formData()
        return body
      }

      const contentDisposition = flattenStandardHeader(message.json.headers['content-disposition'])
      const filename = contentDisposition !== undefined
        ? getFilenameFromContentDisposition(contentDisposition)
        : undefined

      const body = new File(message.binary ? [message.binary] : [], filename ?? 'blob', {
        type: flattenStandardHeader(message.json.headers['content-type']) ?? 'application/octet-stream',
      })

      return body
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

/**
 * Encode a `StandardBody` into JSON, binary data, and headers.
 * Event and octet streams are handled separately.
 *
 * Unlike HTTP adapters, binary types (Blob, File, ReadableStream)
 * do not use a custom `standard-server` header, because receivers must parse the body as sent.
 *
 * For compatibility, set headers by body type,
 * following HTTP adapter conventions.
 */
export async function encodeAtomicStandardBody(
  body: StandardBody,
  headers: StandardHeaders,
): Promise<[
  jsonBody: unknown,
  headers: StandardHeaders,
  binary: Uint8Array<ArrayBuffer> | Blob | undefined,
]> {
  headers = { ...headers }
  let binary: Uint8Array<ArrayBuffer> | Blob | undefined
  let json: unknown

  if (body instanceof ReadableStream) {
    headers['standard-server'] = 'octet-stream' satisfies StandardBodyHint
    // content-type should be set when body is present
    headers['content-type'] ??= 'application/octet-stream'
  }
  else if (body instanceof Blob) {
    binary = body

    headers['standard-server'] = 'file' satisfies StandardBodyHint
    headers['content-type'] = body.type
    headers['content-disposition'] ??= generateContentDisposition(
      body instanceof File ? body.name : 'blob',
    )

    // BunS3 can use NaN for the size
    if (!Number.isNaN(body.size)) {
      headers['content-length'] = body.size.toString()
    }
  }
  else {
    headers['standard-server'] = undefined
    headers['content-length'] = undefined

    if (isAsyncIteratorObject(body)) {
      headers['content-type'] = 'text/event-stream'
    }
    else if (body instanceof FormData) {
      const res = new Response(body)
      binary = await res.blob()
      headers['content-type'] = res.headers.get('content-type')!
      headers['content-length'] = binary.size.toString()
    }
    else if (body instanceof URLSearchParams) {
      json = body.toString()
      headers['content-type'] = 'application/x-www-form-urlencoded'
    }
    else if (body === undefined) {
      headers['content-type'] = undefined
    }
    else {
      json = body
      headers['content-type'] = 'application/json'
    }
  }

  return [json, headers, binary]
}
