import type { StandardHeaders } from '@standardserver/core'

/**
 * Convert fetch headers to standard headers.
 */
export function toStandardHeaders(headers: Headers): StandardHeaders {
  const standardHeaders: StandardHeaders = {}

  headers.forEach((value, key) => {
    if (Array.isArray(standardHeaders[key])) {
      standardHeaders[key].push(value)
    }
    else if (standardHeaders[key] !== undefined) {
      standardHeaders[key] = [standardHeaders[key], value]
    }
    else {
      standardHeaders[key] = value
    }
  })

  return standardHeaders
}

/**
 * Convert standard headers to fetch headers.
 */
export function toFetchHeaders(standardHeaders: StandardHeaders): Headers {
  const headers = new Headers()

  for (const [key, value] of Object.entries(standardHeaders)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v)
      }
    }
    else if (value !== undefined) {
      headers.append(key, value)
    }
  }

  return headers
}
