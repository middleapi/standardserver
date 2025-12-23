import type { StandardLazyRequest, StandardRequest } from '@standardserver/core'
import type { ToFetchBodyOptions, ToStandardBodyOptions } from './body'
import { toFetchBody, toStandardBody } from './body'
import { toFetchHeaders, toStandardHeaders } from './headers'
import { toFetchUrl, toStandardUrl } from './url'

export interface ToStandardLazyRequestOptions extends ToStandardBodyOptions {}

/**
 * Convert a fetch request to a standard request.
 */
export function toStandardLazyRequest(request: Request, options: ToStandardLazyRequestOptions = {}): StandardLazyRequest {
  return {
    ...toStandardUrl(new URL(request.url)),
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
    body: () => toStandardBody(request, options),
    signal: request.signal,
  }
}

export interface ToFetchRequestOptions extends ToFetchBodyOptions {}

/**
 * Convert a standard request to a fetch request.
 */
export function toFetchRequest(request: StandardRequest, options: ToFetchRequestOptions = {}): Request {
  const [body, headers] = toFetchBody(request.body, toFetchHeaders(request.headers), options)

  return new Request(toFetchUrl(request), {
    method: request.method,
    headers,
    body: body ?? null, // null = empty body
    signal: request.signal ?? null,
  })
}
