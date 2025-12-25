import type { StandardBody, StandardBodyHint, StandardHeaders } from '@standardserver/core'
import type { Buffer } from 'node:buffer'
import type { IncomingMessage } from 'node:http'
import type { ToEventStreamOptions } from './event-iterator'
import type { NodeHttpRequest } from './types'
import { Readable } from 'node:stream'
import { flattenStandardHeader, generateContentDisposition, getFilenameFromContentDisposition } from '@standardserver/core'
import { isAsyncIteratorObject, parseEmptyableJSON, stringifyJSON } from '@standardserver/shared'
import { toEventIterator, toEventStream } from './event-iterator'
import { toStandardMethod } from './method'

export interface ToStandardBodyOptions {
  /**
   * Hints on how the body should be parsed.
   */
  hint?: StandardBodyHint | undefined
}

const EMPTY_BODY_METHOD_SET = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

/**
 * Parses the body of a node http request.
 */
export async function toStandardBody(
  req: NodeHttpRequest,
  options: ToStandardBodyOptions = {},
): Promise<StandardBody> {
  const hint = flattenStandardHeader(req.headers['standard-server']) ?? options?.hint
  const contentType = req.headers['content-type']
  const mimeType = contentType?.split(';')[0]?.trim()
  const contentDisposition = req.headers['content-disposition']
  const contentLength = req.headers['content-length']

  if (hint === 'none') {
    return undefined
  }

  if (hint === undefined && EMPTY_BODY_METHOD_SET.has(toStandardMethod(req.method))) {
    return undefined
  }

  // body's already parsed by upstream framework like express, ...
  if (req.body !== undefined) {
    return req.body
  }

  if (!req.readable) {
    // native fetch error use TypeError
    throw new TypeError('Failed to read body: body stream already read or destroyed')
  }

  if (hint === 'json' || (hint === undefined && contentDisposition === undefined && mimeType === 'application/json')) {
    const text = await _streamToString(req)
    return parseEmptyableJSON(text)
  }

  if (hint === 'form-data' || (hint === undefined && contentDisposition === undefined && mimeType === 'multipart/form-data')) {
    return _streamToFormData(req, contentType)
  }

  if (hint === 'url-search-params' || (hint === undefined && contentDisposition === undefined && mimeType === 'application/x-www-form-urlencoded')) {
    const text = await _streamToString(req)
    return new URLSearchParams(text)
  }

  if (hint === 'event-stream' || (hint === undefined && contentDisposition === undefined && mimeType === 'text/event-stream')) {
    return toEventIterator(req)
  }

  if (hint === 'file' || (hint === undefined && (contentDisposition !== undefined || contentLength !== undefined))) {
    const fileName = contentDisposition !== undefined
      ? getFilenameFromContentDisposition(contentDisposition)
      : undefined

    return _streamToFile(req, fileName ?? 'blob', contentType ?? '')
  }

  // TODO: support http2
  return Readable.toWeb(req as IncomingMessage)
}

export interface ToNodeHttpBodyOptions {
  /**
   * Options for the event iterator, like keep-alive settings, initial comment, etc.
   */
  eventIterator?: ToEventStreamOptions
}

export function toNodeHttpBody(
  body: StandardBody,
  headers: StandardHeaders,
  options: ToNodeHttpBodyOptions = {},
): [
  body: Readable | undefined | string,
  headers: StandardHeaders,
] {
  headers = { ...headers } // copy

  const contentDisposition = flattenStandardHeader(headers['content-disposition'])

  headers['content-type'] = undefined
  headers['content-length'] = undefined
  headers['content-disposition'] = undefined

  if (body === undefined) {
    headers['standard-server'] = 'none' satisfies StandardBodyHint
    return [undefined, headers]
  }

  if (body instanceof Blob) {
    headers['standard-server'] = 'file' satisfies StandardBodyHint
    headers['content-type'] = body.type

    if (contentDisposition === undefined || getFilenameFromContentDisposition(contentDisposition) === undefined) {
      headers['content-disposition'] = generateContentDisposition(body instanceof File ? body.name : 'blob')
    }
    else {
      headers['content-disposition'] = contentDisposition
    }

    // BunS3 can use NaN for the size
    if (!Number.isNaN(body.size)) {
      headers['content-length'] = body.size.toString()
    }

    return [Readable.fromWeb(body.stream()), headers]
  }

  if (body instanceof FormData) {
    const response = new Response(body)
    headers['standard-server'] = 'form-data' satisfies StandardBodyHint
    headers['content-type'] = response.headers.get('content-type')!

    return [Readable.fromWeb(response.body!), headers]
  }

  if (body instanceof URLSearchParams) {
    headers['standard-server'] = 'url-search-params' satisfies StandardBodyHint
    headers['content-type'] = 'application/x-www-form-urlencoded'

    return [body.toString(), headers]
  }

  if (isAsyncIteratorObject(body)) {
    headers['standard-server'] = 'event-stream' satisfies StandardBodyHint
    headers['content-type'] = 'text/event-stream'

    return [toEventStream(body, options.eventIterator), headers]
  }

  headers['standard-server'] = 'json' satisfies StandardBodyHint
  headers['content-type'] = 'application/json'

  return [stringifyJSON(body), headers]
}

function _streamToFormData(stream: Readable, contentType: string | undefined): Promise<FormData> {
  const response = new Response(stream, {
    headers: {
      'content-type': contentType,
    },
  })

  return response.formData()
}

async function _streamToString(stream: Readable): Promise<string> {
  let string = ''

  for await (const chunk of stream) {
    string += chunk.toString()
  }

  return string
}

async function _streamToFile(stream: Readable, fileName: string, contentType: string): Promise<File> {
  const chunks: Buffer<ArrayBuffer>[] = []

  for await (const chunk of stream) {
    chunks.push(chunk)
  }

  return new File(chunks, fileName, { type: contentType })
}
