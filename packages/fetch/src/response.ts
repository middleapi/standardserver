import type { StandardLazyResponse, StandardResponse } from '@standardserver/core'
import type { ToFetchBodyOptions } from './body'
import { toFetchBody, toStandardBody } from './body'
import { toFetchHeaders, toStandardHeaders } from './headers'

export interface ToFetchResponseOptions {
  /**
   * Options for body conversion, like event iterator options, etc.
   */
  body?: ToFetchBodyOptions
}

export function toFetchResponse(
  response: StandardResponse,
  options: ToFetchResponseOptions = {},
): Response {
  const [body, headers] = toFetchBody(response.body, toFetchHeaders(response.headers), options.body)
  return new Response(body, { headers, status: response.status })
}

export function toStandardLazyResponse(
  response: Response,
): StandardLazyResponse {
  return {
    body: hint => toStandardBody(response, { hint }),
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
