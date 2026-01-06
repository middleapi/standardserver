import type { StandardBody, StandardBodyHint, StandardHeaders } from '@standardserver/core'
import type { ToEventStreamOptions } from './event-stream'
import { generateContentDisposition, getFilenameFromContentDisposition } from '@standardserver/core'
import { isAsyncIteratorObject, parseEmptyableJSON, stringifyJSON } from '@standardserver/shared'
import { toEventIterator, toEventStream } from './event-stream'

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
  const contentDisposition = re.headers.get('content-disposition')
  const contentLength = re.headers.get('content-length')

  if (hint === 'none') {
    return undefined
  }

  // request.body might be null if the method is GET, HEAD, or other methods.
  // @warning response.body over fetch is almost always a stream,
  // even if the standard-server response body is undefined.
  // @warning React Native fetch body might not exist (undefined), so we need to explicitly check for null.
  if (hint === undefined && re.body === null) {
    return undefined
  }

  if (re.bodyUsed) {
    // native fetch error use TypeError
    throw new TypeError('Failed to read body: body stream already read')
  }

  if (hint === 'json' || (hint === undefined && contentDisposition === null && mimeType === 'application/json')) {
    const text = await re.text()
    return parseEmptyableJSON(text)
  }

  if (hint === 'form-data' || (hint === undefined && contentDisposition === null && mimeType === 'multipart/form-data')) {
    return await re.formData()
  }

  if (hint === 'url-search-params' || (hint === undefined && contentDisposition === null && mimeType === 'application/x-www-form-urlencoded')) {
    const text = await re.text()
    return new URLSearchParams(text)
  }

  if (hint === 'event-stream' || (hint === undefined && contentDisposition === null && mimeType === 'text/event-stream')) {
    return toEventIterator(re.body)
  }

  if (hint === 'file' || (hint === undefined && (contentDisposition !== null || contentLength !== null))) {
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
   * Options for the event iterator, like keep-alive settings, initial comment, etc.
   */
  eventIterator?: ToEventStreamOptions
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
  headers = { ...headers }

  if (body === undefined) {
    headers['standard-server'] = 'none' satisfies StandardBodyHint
    return [undefined, headers]
  }

  if (body instanceof ReadableStream) {
    headers['standard-server'] = 'octet-stream' satisfies StandardBodyHint
    headers['content-type'] ??= 'application/octet-stream'
    return [body, headers]
  }

  if (body instanceof Blob) {
    headers['standard-server'] = 'file' satisfies StandardBodyHint // file is a blob, but blob is not a file
    headers['content-type'] ??= body.type
    headers['content-disposition'] ??= generateContentDisposition(body instanceof File ? body.name : 'blob')

    // BunS3 can use NaN for the size
    if (Number.isNaN(body.size)) {
      return [body.stream(), headers]
    }

    headers['content-length'] ??= body.size.toString()
    return [body, headers]
  }

  if (body instanceof FormData) {
    headers['standard-server'] = 'form-data' satisfies StandardBodyHint
    return [body, headers]
  }

  if (body instanceof URLSearchParams) {
    headers['standard-server'] = 'url-search-params' satisfies StandardBodyHint
    return [body, headers]
  }

  if (isAsyncIteratorObject(body)) {
    headers['standard-server'] = 'event-stream' satisfies StandardBodyHint
    headers['content-type'] ??= 'text/event-stream'
    return [toEventStream(body, options.eventIterator), headers]
  }

  headers['standard-server'] = 'json' satisfies StandardBodyHint
  headers['content-type'] ??= 'application/json'
  return [stringifyJSON(body), headers]
}
