import type { StandardLazyResponse, StandardResponse } from '@standardserver/core'
import type { ToFetchBodyOptions, ToStandardBodyOptions } from './body'
import { toFetchBody, toStandardBody } from './body'
import { toFetchHeaders, toStandardHeaders } from './headers'

export interface ToFetchResponseOptions extends ToFetchBodyOptions {}

export function toFetchResponse(
  response: StandardResponse,
  options: ToFetchResponseOptions = {},
): Response {
  const [body, headers] = toFetchBody(response.body, toFetchHeaders(response.headers), options)
  return new Response(body, { headers, status: response.status })
}

export interface ToStandardLazyResponseOptions extends ToStandardBodyOptions {}

export function toStandardLazyResponse(
  response: Response,
  options: ToStandardLazyResponseOptions = {},
): StandardLazyResponse {
  return {
    body: () => toStandardBody(response, options),
    status: response.status,
    get headers() {
      // lazy headers to improve performance
      const headers = toStandardHeaders(response.headers)
      Object.defineProperty(this, 'headers', { value: headers, writable: true })
      return headers
    },
    set headers(value) {
      Object.defineProperty(this, 'headers', { value, writable: true })
    },
  }
}
