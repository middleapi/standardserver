import type { StandardUrl } from '@standardserver/core'

export function toStandardUrl(url: URL): StandardUrl {
  const pathname = `${url.pathname.startsWith('/') ? '' : '/'}${url.pathname}` as `/${string}`
  return `${pathname}${url.search}${url.hash}`
}
