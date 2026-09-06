import type { StandardUrl } from '@standard-server/core'

export function toStandardUrl(url: URL): StandardUrl {
  /* v8 ignore start - url.pathname always start with "/" */
  const pathname = `${url.pathname.startsWith('/') ? '' : '/'}${url.pathname}` as `/${string}`
  /* v8 ignore end  */
  return `${pathname}${url.search}${url.hash}`
}
