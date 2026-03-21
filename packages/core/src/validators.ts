import type { StandardHeaders, StandardMethod, StandardRequest, StandardResponse, StandardUrl } from './types'
import { isTypescriptObject } from '@standardserver/shared'

export function isStandardMethod(maybe: unknown): maybe is StandardMethod {
  return typeof maybe === 'string'
}

export function isStandardUrl(maybe: unknown): maybe is StandardUrl {
  return typeof maybe === 'string' && maybe.startsWith('/')
}

export function isStandardHeaders(maybe: unknown): maybe is StandardHeaders {
  if (!isTypescriptObject(maybe)) {
    return false
  }

  return Object.values(maybe).every(
    value => value === undefined
      || typeof value === 'string'
      || (Array.isArray(value) && value.every(v => typeof v === 'string')),
  )
}

export function isStandardRequest(maybe: unknown): maybe is StandardRequest {
  if (!isTypescriptObject(maybe)) {
    return false
  }

  if (maybe.signal !== undefined && !(maybe.signal instanceof AbortSignal)) {
    return false
  }

  return isStandardMethod(maybe.method) && isStandardUrl(maybe.url) && isStandardHeaders(maybe.headers)
}

export function isStandardResponse(maybe: unknown): maybe is StandardResponse {
  if (!isTypescriptObject(maybe)) {
    return false
  }

  if (!Number.isInteger(maybe.status)) {
    return false
  }

  return isStandardHeaders(maybe.headers)
}
