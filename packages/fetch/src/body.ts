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
  const hint = re.headers.get('standard-server') ?? options?.hint
  const mimeType = re.headers.get('content-type')?.split(';')[0]?.trim()
  const contentLength = re.headers.get('content-length')

  if (hint === 'none' || (hint === undefined && mimeType === undefined && (contentLength === '0' || contentLength === null))) {
    return undefined
  }

  // request.body might be null if the method is GET, HEAD, or other methods.
  // WARNING: response.body over fetch is almost always a stream,
  // even if the standard-server response body is undefined.
  // WARNING: React Native fetch body might not exist (undefined), so we need to explicitly check for null.
  if (hint === undefined && re.body === null) {
    return undefined
  }

  if (re.bodyUsed) {
    // native fetch error use TypeError
    throw new TypeError('Failed to read body: body stream already read')
  }

  if (hint === 'json' || (hint === undefined && mimeType === 'application/json')) {
    const text = await re.text()
    return parseEmptyableJSON(text)
  }

  if (hint === 'form-data' || (hint === undefined && mimeType === 'multipart/form-data')) {
    return await re.formData()
  }

  if (hint === 'url-search-params' || (hint === undefined && mimeType === 'application/x-www-form-urlencoded')) {
    const text = await re.text()
    return new URLSearchParams(text)
  }

  if (hint === 'event-stream' || (hint === undefined && mimeType === 'text/event-stream')) {
    return toAsyncIteratorObject(re.body)
  }

  if (hint === 'file' || (hint === undefined && contentLength !== null)) {
    const contentDisposition = re.headers.get('content-disposition')
    const fileName = contentDisposition !== null
      ? getFilenameFromContentDisposition(contentDisposition)
      : undefined

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
 */
export function toFetchBody(
  body: StandardBody,
  headers: StandardHeaders,
  options: ToFetchBodyOptions = {},
): [
  body: undefined | string | FormData | URLSearchParams | Blob | ReadableStream<Uint8Array<ArrayBuffer>>,
  headers: StandardHeaders,
] {
  const originalContentType = headers['content-type']
  const originalContentLength = headers['content-length']

  headers = {
    ...headers,
    'standard-server': undefined,
    'content-type': undefined,
    'content-length': undefined,
  }

  if (body === undefined) {
    return [undefined, headers]
  }

  if (body instanceof ReadableStream) {
    // Explicitly set the body hint to avoid misidentification
    // when the stream is empty, the length is predictable, or the content type is common.
    headers['standard-server'] = 'octet-stream' satisfies StandardBodyHint

    headers['content-type'] = originalContentType ?? 'application/octet-stream'
    headers['content-length'] = originalContentLength

    return [body, headers]
  }

  if (body instanceof Blob) {
    // Explicitly set the body hint to avoid misidentification
    // when the file size is NaN or the content type is common.
    headers['standard-server'] = 'file' satisfies StandardBodyHint // A File is also a Blob

    headers['content-type'] = body.type
    headers['content-disposition'] ??= generateContentDisposition(body instanceof File ? body.name : 'blob')

    // BunS3 can use NaN for the size
    if (Number.isNaN(body.size)) {
      return [body.stream(), headers]
    }

    headers['content-length'] = body.size.toString()
    return [body, headers]
  }

  if (body instanceof FormData) {
    // Fetch client/server automatically sets content-type, content-length for FormData bodies.
    return [body, headers]
  }

  if (body instanceof URLSearchParams) {
    // Fetch client/server automatically sets content-type, content-length for URLSearchParams bodies.
    return [body, headers]
  }

  if (isAsyncIteratorObject(body)) {
    headers['content-type'] = 'text/event-stream'
    return [toEventStream(body, options.eventStream), headers]
  }

  headers['content-type'] = 'application/json'
  return [stringifyJSON(body), headers]
}
