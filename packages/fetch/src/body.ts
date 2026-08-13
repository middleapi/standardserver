import type { StandardBody, StandardBodyHint, StandardHeaders } from '@standardserver/core'
import type { ToEventStreamOptions } from './event-stream'
import { generateContentDisposition, getFilenameFromContentDisposition } from '@standardserver/core'
import { isAsyncIteratorObject, parseEmptyableJSON, stringifyJSON } from '@standardserver/shared'
import { toAsyncIteratorObject, toEventStream } from './event-stream'

export interface ToStandardBodyOptions {
  /**
   * Hints on how the body should be parsed.
   */
  hint?: StandardBodyHint | undefined
}

/**
 * Convert a fetch request or response to a standard body.
 */
export async function toStandardBody(re: Request | Response, options?: ToStandardBodyOptions): Promise<StandardBody> {
  const hint = options?.hint ?? re.headers.get('standard-server')
  const mimeType = re.headers.get('content-type')?.split(';')[0]?.trim()
  const contentLength = re.headers.get('content-length')

  if (hint === 'none' || (hint === null && mimeType === undefined && (contentLength === '0' || contentLength === null))) {
    return undefined
  }

  if (re.bodyUsed) {
    // native fetch error use TypeError
    throw new TypeError('Failed to read body: body stream already read')
  }

  if (hint === 'json' || (hint === null && mimeType === 'application/json')) {
    const text = await re.text()
    return parseEmptyableJSON(text)
  }

  if (hint === 'form-data' || (hint === null && mimeType === 'multipart/form-data')) {
    return await re.formData()
  }

  if (hint === 'url-search-params' || (hint === null && mimeType === 'application/x-www-form-urlencoded')) {
    const text = await re.text()
    return new URLSearchParams(text)
  }

  if (hint === 'event-stream' || (hint === null && mimeType === 'text/event-stream')) {
    return toAsyncIteratorObject(re.body)
  }

  const contentDisposition = re.headers.get('content-disposition')
  const fileName = contentDisposition !== null
    ? getFilenameFromContentDisposition(contentDisposition)
    : undefined

  if (hint === 'file' || (hint === null && (fileName !== undefined || contentLength !== null))) {
    const blob = await re.blob()
    return new File([blob], fileName ?? 'blob', {
      type: blob.type,
    })
  }

  return re.body ?? new ReadableStream({
    start(controller) {
      controller.close()
    },
  })
}

export interface ToFetchBodyOptions {
  /**
   * Options for the event stream, like keep-alive settings, initial comment, etc.
   */
  eventStream?: ToEventStreamOptions
}

/**
 * Convert a standard body to a fetch body.
 *
 * Binary bodies (Blob, ReadableStream) can override the aut-set standard-server header,
 * enabling pre-encoded body transmission while preserving client-side type interpretation.
 */
export function toFetchBody(
  body: StandardBody,
  headers: StandardHeaders,
  options: ToFetchBodyOptions = {},
): [
  body: undefined | string | FormData | URLSearchParams | Blob | ReadableStream<Uint8Array<ArrayBuffer>>,
  headers: StandardHeaders,
] {
  headers = { ...headers }

  if (body instanceof ReadableStream) {
    // Always set the body hint: the length of a stream is unknown here, but the transport
    // can still send a content-length (an empty stream), which reads back as a file.
    headers['standard-server'] ??= 'octet-stream' satisfies StandardBodyHint
    // content-type should be set when body is present
    headers['content-type'] ??= 'application/octet-stream'

    return [body, headers]
  }

  if (body instanceof Blob) {
    // Explicitly set the body hint: the content headers alone cannot always identify a file,
    // and a transport can drop the empty ones (bun) or a proxy rewrite the content-length.
    headers['standard-server'] ??= 'file' satisfies StandardBodyHint // A File is also a Blob

    headers['content-type'] = body.type
    // FIX: Bun returns `undefined` for an empty File name, despite the spec requiring a string
    headers['content-disposition'] ??= generateContentDisposition(body instanceof File ? body.name ?? '' : 'blob')

    // BunS3 can use NaN for the size
    if (Number.isFinite(body.size)) {
      headers['content-length'] = body.size.toString()
      return [body, headers]
    }

    return [body.stream(), headers]
  }

  headers['standard-server'] = undefined
  headers['content-length'] = undefined

  if (body === undefined) {
    headers['content-type'] = undefined
    return [undefined, headers]
  }

  if (body instanceof FormData) {
    // Fetch automatically sets content-type for FormData bodies.
    headers['content-type'] = undefined
    return [body, headers]
  }

  if (body instanceof URLSearchParams) {
    // Fetch automatically sets content-type for URLSearchParams bodies.
    headers['content-type'] = undefined
    return [body, headers]
  }

  if (isAsyncIteratorObject(body)) {
    headers['content-type'] = 'text/event-stream'
    return [toEventStream(body, options.eventStream), headers]
  }

  headers['content-type'] = 'application/json'
  return [stringifyJSON(body), headers]
}
