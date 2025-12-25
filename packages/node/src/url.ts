import type { StandardUrl } from '@standardserver/core'
import type { NodeHttpRequest } from './types'

export function toStandardUrl(req: NodeHttpRequest): StandardUrl {
  const postfix = req.originalUrl ?? req.url ?? '/'
  const url = new URL(`http://localhost${postfix?.startsWith('/') ? '' : '/'}${postfix}`)

  return {
    /* v8 ignore next 1 - url always starts with / */
    pathname: url.pathname?.startsWith('/') ? url.pathname as `/${string}` : `/${url.pathname}`,
    hash: url.hash?.startsWith('#') ? url.hash as `#${string}` : undefined,
    query: url.searchParams,
  }
}
