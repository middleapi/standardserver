import type { StandardHeaders } from './types'
import { toArray, tryDecodeURIComponent } from '@standardserver/shared'

export function generateContentDisposition(filename: string): string {
  const escapedFileName = filename.replace(/"/g, '\\"')

  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent#encoding_for_content-disposition_and_link_headers
  const encodedFilenameStar = encodeURIComponent(filename)
    .replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%(7C|60|5E)/g, (str, hex) => String.fromCharCode(Number.parseInt(hex, 16)))

  return `inline; filename="${escapedFileName}"; filename*=utf-8''${encodedFilenameStar}`
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
  const merged = { ...a }

  for (const key in b) {
    if (Array.isArray(b[key])) {
      merged[key] = [...toArray(merged[key]), ...b[key]]
    }
    else if (b[key] !== undefined) {
      if (Array.isArray(merged[key])) {
        merged[key] = [...merged[key], b[key]]
      }
      else if (merged[key] !== undefined) {
        merged[key] = [merged[key], b[key]]
      }
      else {
        merged[key] = b[key]
      }
    }
  }

  return merged
}
