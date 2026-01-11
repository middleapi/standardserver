import type { StandardUrl } from '@standardserver/core'
import type { NodeHttpRequest } from './types'

export function toStandardUrl(req: NodeHttpRequest): StandardUrl {
  // prefer originalUrl over url, especially useful in express.js middleware
  const url = req.originalUrl ?? req.url ?? '/'
  return `${url.startsWith('/') ? '' : '/'}${url}` as `/${string}`
}
