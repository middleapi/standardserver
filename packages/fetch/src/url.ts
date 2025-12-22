import type { StandardUrl } from '@standardserver/core'

/**
 * Convert a fetch URL to a standard URL.
 */
export function toStandardUrl(url: URL): StandardUrl {
  return {
    origin: url.origin,
    /* v8 ignore next 1 - url always starts with / */
    pathname: url.pathname.startsWith('/') ? url.pathname as `/${string}` : `/${url.pathname}`,
    query: url.searchParams,
    hash: url.hash.startsWith('#') ? url.hash as `#${string}` : undefined,
    username: url.username,
    password: url.password,
  }
}

/**
 * Convert a standard URL to a fetch URL.
 */
export function toFetchUrl(standardUrl: StandardUrl): string {
  const query = standardUrl.query?.toString()
  const search = query ? `?${query}` : ''
  return (standardUrl.origin ?? '') + standardUrl.pathname + search + (standardUrl.hash ?? '')
}
