import type { StandardHeaders, StandardUrl } from './types'
import { toArray, tryDecodeURIComponent } from '@standardserver/shared'

export function generateContentDisposition(filename: string): string {
  const encodedFilename = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"')

  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent#encoding_for_content-disposition_and_link_headers
  const encodedFilenameStar = encodeURIComponent(filename)
    .replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%(7C|60|5E)/g, (str, hex) => String.fromCharCode(Number.parseInt(hex, 16)))

  return `inline; filename="${encodedFilename}"; filename*=utf-8''${encodedFilenameStar}`
}

export function getFilenameFromContentDisposition(contentDisposition: string): string | undefined {
  const encodedFilenameStarMatch = contentDisposition.match(/filename\*=(UTF-8'')?([^;]*)/i)

  if (encodedFilenameStarMatch && typeof encodedFilenameStarMatch[2] === 'string') {
    return tryDecodeURIComponent(encodedFilenameStarMatch[2])
  }

  const encodedFilenameMatch = contentDisposition.match(/filename="((?:\\"|[^"])*)"/i)
  if (encodedFilenameMatch && typeof encodedFilenameMatch[1] === 'string') {
    return encodedFilenameMatch[1].replace(/\\"/g, '"')
  }
}

export function flattenStandardHeader(header: string | readonly string[] | undefined): string | undefined {
  if (typeof header === 'string' || header === undefined) {
    return header
  }

  if (header.length === 0) {
    return undefined
  }

  return header.join(', ')
}

export function mergeStandardHeaders(a: StandardHeaders, b: StandardHeaders): StandardHeaders {
  const merged = { ...a, ...b }

  for (const key in b) {
    if (!Object.hasOwn(a, key)) {
      continue
    }

    const aValue = a[key]
    const bValue = b[key]

    merged[key] = aValue === undefined || bValue === undefined
      ? aValue ?? bValue
      : [...toArray(aValue), ...toArray(bValue)]
  }

  return merged
}

export function parseStandardUrl(url: StandardUrl): [
  pathname: `/${string}`,
  search: `?${string}` | undefined,
  hash: `#${string}` | undefined,
] {
  const hashStart = url.indexOf('#')
  const searchStart = url.indexOf('?')

  const hasSearchBeforeHash = searchStart !== -1 && (hashStart === -1 || searchStart < hashStart)
  const pathnameEnd = hasSearchBeforeHash ? searchStart : hashStart !== -1 ? hashStart : url.length
  const searchEnd = hashStart !== -1 ? hashStart : url.length

  const pathname = url.slice(0, pathnameEnd) as `/${string}`
  const search = hasSearchBeforeHash ? url.slice(searchStart, searchEnd) as `?${string}` : undefined
  const hash = hashStart !== -1 ? url.slice(hashStart) as `#${string}` : undefined

  return [pathname, search, hash]
}
