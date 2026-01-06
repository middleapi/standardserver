/**
 * Reserved non-resolving origin for origin-agnostic requests.
 *
 * The actual origin may be resolved by a higher-level runtime
 * (e.g. browser `fetch('/path')`).
 *
 * https://www.rfc-editor.org/rfc/rfc2606.html#section-2
 */
export const UNBOUND_ORIGIN = 'http://unbound.invalid' as const

/**
 * Converts a URL string into a `URL` instance.
 *
 * If the input is a relative URL, it is resolved against
 * `UNBOUND_ORIGIN` (`http://unbound.invalid`).
 *
 * If the input is already an absolute URL, it is preserved as-is.
 */
export function stringToUrl(url: string): URL {
  // avoid malformed relative urls
  if (url.startsWith('/')) {
    return new URL(`${UNBOUND_ORIGIN}${url}`)
  }

  return new URL(url, UNBOUND_ORIGIN)
}

/**
 * Converts a `URL` back into a string representation.
 *
 * If the URL uses `UNBOUND_ORIGIN`, the origin is stripped and a
 * relative URL string is returned.
 *
 * If the URL has a concrete origin, it is returned as an absolute URL.
 */
export function urlToString(url: URL): string {
  return url.href.replace(`${UNBOUND_ORIGIN}/`, '/')
}
