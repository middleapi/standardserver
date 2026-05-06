import type { StandardBody, StandardBodyHint, StandardHeaders } from '@standardserver/core'
import type { IncomingMessage } from 'node:http'
import type { ToEventStreamOptions } from './event-stream'
import type { NodeHttpRequest } from './types'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { flattenStandardHeader, generateContentDisposition, getFilenameFromContentDisposition } from '@standardserver/core'
import { isAsyncIteratorObject, parseEmptyableJSON, stringifyJSON } from '@standardserver/shared'
import { toEventIterator, toEventStream } from './event-stream'
import { toStandardMethod } from './method'

export interface ToStandardBodyOptions {
  /**
   * Hints on how the body should be parsed.
   */
  hint?: StandardBodyHint | undefined
}
/**
 * https://developer.mozilla.org/en-US/docs/Web/API/Request/body
 */
const EMPTY_BODY_METHOD_SET = new Set(['GET', 'HEAD'])

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
  const contentLength = req.headers['content-length']

  // body's already parsed by upstream framework like express, ...
  if (req.body !== undefined) {
    return req.body
  }

  if (hint === 'none' || (hint === undefined && mimeType === undefined && (contentLength === '0' || contentLength === undefined))) {
    return undefined
  }

  if (hint === undefined && EMPTY_BODY_METHOD_SET.has(toStandardMethod(req.method))) {
    return undefined
  }

  if (!req.readable) {
    // native fetch error use TypeError
    throw new TypeError('Failed to read body: body stream already read or destroyed')
  }

  if (hint === 'json' || (hint === undefined && mimeType === 'application/json')) {
    const text = await _streamToString(req)
    return parseEmptyableJSON(text)
  }

  if (hint === 'form-data' || (hint === undefined && mimeType === 'multipart/form-data')) {
    return _streamToFormData(req, contentType)
  }

  if (hint === 'url-search-params' || (hint === undefined && mimeType === 'application/x-www-form-urlencoded')) {
    const text = await _streamToString(req)
    return new URLSearchParams(text)
  }

  if (hint === 'event-stream' || (hint === undefined && mimeType === 'text/event-stream')) {
    return toEventIterator(req)
  }

  if (hint === 'file' || (hint === undefined && contentLength !== undefined)) {
    const contentDisposition = req.headers['content-disposition']
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
   * Options for the event stream, like keep-alive settings, initial comment, etc.
   */
  eventStream?: ToEventStreamOptions
}

export async function toNodeHttpBody(
  body: StandardBody,
  headers: StandardHeaders,
  options: ToNodeHttpBodyOptions = {},
): Promise<[
  body: Readable | undefined | string,
  headers: StandardHeaders,
]> {
  const originalContentType = headers['content-type']
  const originalContentLength = headers['content-length']

  headers = {
    ...headers,
    'standard-server': undefined,
    'content-type': undefined,
    'content-length': undefined,
  }

  if (body === undefined) {
    return [undefined, headers]
  }

  if (body instanceof ReadableStream) {
    // Explicitly set the body hint to avoid misidentification
    // when the stream is empty, the length is predictable, or the content type is common.
    headers['standard-server'] = 'octet-stream' satisfies StandardBodyHint

    // content-type is required when body is present
    headers['content-type'] = originalContentType ?? 'application/octet-stream'
    headers['content-length'] = originalContentLength

    return [Readable.fromWeb(body), headers]
  }

  if (body instanceof Blob) {
    // Explicitly set the body hint to avoid misidentification
    // when the file size is NaN or the content type is common.
    headers['standard-server'] = 'file' satisfies StandardBodyHint // A File is also a Blob

    headers['content-type'] = body.type
    headers['content-disposition'] ??= generateContentDisposition(body instanceof File ? body.name : 'blob')

    // BunS3 can use NaN for the size
    if (!Number.isNaN(body.size)) {
      headers['content-length'] = body.size.toString()
    }

    return [Readable.fromWeb(body.stream()), headers]
  }

  if (body instanceof FormData) {
    const response = new Response(body)
    // some formdata parser require content-length, so we need load the blob first
    const blob = await response.blob()
    headers['content-type'] = blob.type
    headers['content-length'] = blob.size.toString()

    return [Readable.fromWeb(blob.stream()), headers]
  }

  if (body instanceof URLSearchParams) {
    headers['content-type'] = 'application/x-www-form-urlencoded'
    return [body.toString(), headers]
  }

  if (isAsyncIteratorObject(body)) {
    headers['content-type'] = 'text/event-stream'
    return [toEventStream(body, options.eventStream), headers]
  }

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
  const decoder = new TextDecoder()
  let string = ''

  for await (const chunk of stream) {
    string += decoder.decode(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), { stream: true })
  }

  // Flush any remaining bytes (e.g. incomplete multi-byte sequences)
  string += decoder.decode()

  return string
}

async function _streamToFile(stream: Readable, fileName: string, contentType: string): Promise<File> {
  const chunks: Buffer<ArrayBuffer>[] = []

  for await (const chunk of stream) {
    chunks.push(chunk)
  }

  return new File(chunks, fileName, { type: contentType })
}
