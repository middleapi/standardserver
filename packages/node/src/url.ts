import type { StandardUrl } from '@standardserver/core'
import type { NodeHttpRequest } from './types'

function fromAbsoluteHttpUrl(url: string): StandardUrl | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined
    }

    const pathname = `${parsed.pathname.startsWith('/') ? '' : '/'}${parsed.pathname}` as `/${string}`
    return `${pathname}${parsed.search}${parsed.hash}`
  }
  catch {
    return undefined
  }
}

export function toStandardUrl(req: NodeHttpRequest): StandardUrl {
  // prefer originalUrl over url, especially useful in express.js middleware
  const url = req.originalUrl ?? req.url ?? '/'

  if (url.startsWith('/')) {
    return url as StandardUrl
  }

  // RFC 9112 absolute-form. Fetch adapter uses URL.pathname + search + hash.
  const fromAbsolute = fromAbsoluteHttpUrl(url)
  if (fromAbsolute !== undefined) {
    return fromAbsolute
  }

  return `/${url}` as StandardUrl
}
