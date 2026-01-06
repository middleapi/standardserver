import type { StandardLazyRequest, StandardRequest } from '@standardserver/core'
import type { ToFetchBodyOptions } from './body'
import { stringToUrl, urlToString } from '@standardserver/core'
import { toFetchBody, toStandardBody } from './body'
import { toFetchHeaders, toStandardHeaders } from './headers'

/**
 * Convert a fetch request to a standard request.
 */
export function toStandardLazyRequest(request: Request): StandardLazyRequest {
  return {
    url: stringToUrl(request.url),
    method: request.method,
    get headers() {
      // lazy headers to improve performance
      const headers = toStandardHeaders(request.headers)
      Object.defineProperty(this, 'headers', { value: headers, writable: true })
      return headers
    },
    set headers(value) {
      Object.defineProperty(this, 'headers', { value, writable: true })
    },
    body: hint => toStandardBody(request, { hint }),
    signal: request.signal,
  }
}

export interface ToFetchRequestOptions {
  /**
   * Options for body conversion, like event iterator options, etc.
   */
  body?: ToFetchBodyOptions
}

/**
 * Convert a standard request to a fetch request.
 */
export function toFetchRequest(request: StandardRequest, options: ToFetchRequestOptions = {}): Request {
  const [body, headers] = toFetchBody(request.body, toFetchHeaders(request.headers), options.body)

  return new Request(urlToString(request.url), {
    method: request.method,
    headers,
    body: body ?? null, // null = empty body
    signal: request.signal ?? null,
  })
}
