import type { StandardBody, StandardBodyHint } from '@standardserver/core'
import type { ToEventStreamOptions } from './event-iterator'
import { generateContentDisposition, getFilenameFromContentDisposition } from '@standardserver/core'
import { isAsyncIteratorObject, parseEmptyableJSON, stringifyJSON } from '@standardserver/shared'
import { toEventIterator, toEventStream } from './event-iterator'

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

  if (hint === 'none') {
    return undefined
  }

  if (re.bodyUsed) {
    // native fetch error use TypeError
    throw new TypeError('Failed to read body: body stream already read')
  }

  const mimeType = re.headers.get('content-type')?.split(';')[0]?.trim()
  const contentDisposition = re.headers.get('content-disposition')
  const fileName = contentDisposition !== null
    ? getFilenameFromContentDisposition(contentDisposition)
    : undefined

  if (hint === 'json' || (hint === undefined && fileName === undefined && mimeType === 'application/json')) {
    const text = await re.text()
    return parseEmptyableJSON(text)
  }

  if (hint === 'form-data' || (hint === undefined && fileName === undefined && mimeType === 'multipart/form-data')) {
    return await re.formData()
  }

  if (hint === 'url-search-params' || (hint === undefined && fileName === undefined && mimeType === 'application/x-www-form-urlencoded')) {
    const text = await re.text()
    return new URLSearchParams(text)
  }

  if (hint === 'event-stream' || (hint === undefined && fileName === undefined && mimeType === 'text/event-stream')) {
    return toEventIterator(re.body)
  }

  if (hint === 'stream') {
    return re.body ?? new ReadableStream({
      start(controller) {
        controller.close()
      },
    })
  }

  const contentLength = re.headers.get('content-length')

  if (hint === 'file' || (hint === undefined && (fileName !== undefined || contentLength !== null))) {
    const blob = await re.blob()
    return new File([blob], fileName ?? 'blob', {
      type: blob.type,
    })
  }

  return re.body ?? undefined // stream or undefined
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
  headers: Headers,
  options: ToFetchBodyOptions = {},
): [
  body: undefined | string | FormData | URLSearchParams | Blob | ReadableStream<Uint8Array<ArrayBuffer>>,
  headers: Headers,
] {
  headers = new Headers(headers) // clone
  headers.delete('standard-server')

  if (body instanceof ReadableStream) {
    headers.set('standard-server', 'stream' satisfies StandardBodyHint)
    return [body, headers]
  }

  const contentDisposition = headers.get('content-disposition')
  headers.delete('content-type')
  headers.delete('content-length')
  headers.delete('content-disposition')

  if (body === undefined) {
    headers.set('standard-server', 'none' satisfies StandardBodyHint)
    return [undefined, headers]
  }

  if (body instanceof Blob) {
    headers.set('standard-server', 'file' satisfies StandardBodyHint) // file is a blob, but blob is not a file
    headers.set('content-type', body.type)

    if (contentDisposition === null || getFilenameFromContentDisposition(contentDisposition) === undefined) {
      headers.set('content-disposition', generateContentDisposition(body instanceof File ? body.name : 'blob'))
    }
    else {
      headers.set('content-disposition', contentDisposition)
    }

    if (Number.isSafeInteger(body.size)) {
      headers.set('content-length', body.size.toString())
      return [body, headers]
    }

    return [body.stream(), headers]
  }

  if (body instanceof FormData) {
    headers.set('standard-server', 'form-data' satisfies StandardBodyHint)
    return [body, headers]
  }

  if (body instanceof URLSearchParams) {
    headers.set('standard-server', 'url-search-params' satisfies StandardBodyHint)
    return [body, headers]
  }

  if (isAsyncIteratorObject(body)) {
    headers.set('standard-server', 'event-stream' satisfies StandardBodyHint)
    headers.set('content-type', 'text/event-stream')

    return [toEventStream(body, options.eventIterator), headers]
  }

  headers.set('standard-server', 'json' satisfies StandardBodyHint)
  headers.set('content-type', 'application/json')
  return [stringifyJSON(body), headers]
}
