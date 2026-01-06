import type { NodeHttpRequest } from './types'
import { UNBOUND_ORIGIN } from '@standardserver/core'

export interface ToStandardUrlOptions {
  /**
   * The origin to use to construct the URL.
   *
   * @default inferred from request headers or fallback to `UNBOUND_ORIGIN`
   */
  origin?: string
}

export function toStandardUrl(req: NodeHttpRequest, { origin }: ToStandardUrlOptions = {}): URL {
  if (origin === undefined) {
    origin = UNBOUND_ORIGIN

    const host = req.headers.host
    if (host !== undefined) {
      try {
        const protocol = ('encrypted' in req.socket && req.socket.encrypted ? 'https:' : 'http:')
        origin = new URL(`${protocol}//${host}`).origin
      }
      catch {
        // ignore error
      }
    }
  }

  const path = req.originalUrl ?? req.url ?? '/'
  return new URL(`${origin}${path.startsWith('/') ? '' : '/'}${path}`)
}
