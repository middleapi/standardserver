import type { StandardBody, StandardBodyHint } from '@standardserver/core'
import type { AnyAPIGatewayProxyEvent } from './types'
import { Buffer } from 'node:buffer'
import { flattenStandardHeader, getFilenameFromContentDisposition } from '@standardserver/core'
import { toAsyncIteratorObject } from '@standardserver/fetch'
import { parseEmptyableJSON } from '@standardserver/shared'
import { getEventHeader } from './headers'

export interface ToStandardBodyOptions {
  /**
   * Hints on how the body should be parsed.
   */
  hint?: StandardBodyHint | undefined
}

/**
 * Parses the fully buffered, optionally base64-encoded body of an API Gateway proxy event.
 */
export async function toStandardBody(
  event: AnyAPIGatewayProxyEvent,
  options: ToStandardBodyOptions = {},
): Promise<StandardBody> {
  const hint = options?.hint ?? flattenStandardHeader(getEventHeader(event, 'standard-server'))
  const contentType = flattenStandardHeader(getEventHeader(event, 'content-type'))
  const mimeType = contentType?.split(';')[0]?.trim()

  if (hint === 'none' || (hint === undefined && typeof event.body !== 'string')) {
    return undefined
  }

  const bytes: Uint8Array<ArrayBuffer> = typeof event.body !== 'string'
    ? new Uint8Array()
    : event.isBase64Encoded
      ? Buffer.from(event.body, 'base64') as Uint8Array<ArrayBuffer>
      : new TextEncoder().encode(event.body)

  // the body is fully buffered so its emptiness is always known
  if (hint === undefined && mimeType === undefined && bytes.length === 0) {
    return undefined
  }

  if (hint === 'json' || (hint === undefined && mimeType === 'application/json')) {
    return parseEmptyableJSON(new TextDecoder().decode(bytes))
  }

  if (hint === 'form-data' || (hint === undefined && mimeType === 'multipart/form-data')) {
    return _bytesToFormData(bytes, contentType)
  }

  if (hint === 'url-search-params' || (hint === undefined && mimeType === 'application/x-www-form-urlencoded')) {
    return new URLSearchParams(new TextDecoder().decode(bytes))
  }

  if (hint === 'event-stream' || (hint === undefined && mimeType === 'text/event-stream')) {
    return toAsyncIteratorObject(_bytesToReadableStream(bytes))
  }

  if (hint === 'file' || (hint === undefined && flattenStandardHeader(getEventHeader(event, 'content-length')) !== undefined)) {
    const contentDisposition = flattenStandardHeader(getEventHeader(event, 'content-disposition'))
    const fileName = contentDisposition !== undefined
      ? getFilenameFromContentDisposition(contentDisposition)
      : undefined

    return new File([bytes], fileName ?? 'blob', { type: contentType ?? '' })
  }

  return _bytesToReadableStream(bytes)
}

function _bytesToFormData(bytes: Uint8Array<ArrayBuffer>, contentType: string | undefined): Promise<FormData> {
  const response = new Response(bytes, {
    headers: {
      'content-type': contentType ?? '',
    },
  })

  return response.formData()
}

function _bytesToReadableStream(bytes: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}
