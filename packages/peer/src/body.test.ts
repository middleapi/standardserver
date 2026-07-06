import type { StandardHeaders } from '@standardserver/core'
import type { PeerRequestMessage } from './types'
import { generateContentDisposition } from '@standardserver/core'
import { AsyncIteratorClass, isAsyncIteratorObject, Queue } from '@standardserver/shared'
import { encodeAtomicStandardBody, toStandardBody } from './body'

describe('toStandardBody', () => {
  function makeMessage(options: {
    bodyHint?: string
    contentType?: string
    contentLength?: string
    contentDisposition?: string
    body?: unknown
    binary?: Uint8Array<ArrayBuffer>
  }): PeerRequestMessage {
    const headers: StandardHeaders = {}
    if (options.bodyHint !== undefined) {
      headers['standard-server'] = options.bodyHint
    }
    if (options.contentType !== undefined) {
      headers['content-type'] = options.contentType
    }
    if (options.contentLength !== undefined) {
      headers['content-length'] = options.contentLength
    }
    if (options.contentDisposition !== undefined) {
      headers['content-disposition'] = options.contentDisposition
    }
    return {
      id: '1',
      kind: 'request',
      json: { method: 'POST', url: '/test', headers, body: options.body },
      binary: options.binary,
    }
  }

  describe('with standard-server hint', () => {
    it('receives a server-sent event stream', async () => {
      const cleanup = vi.fn()
      const { resolveBody, eventStreamMessageQueue } = toStandardBody(makeMessage({ bodyHint: 'event-stream' }), cleanup)

      const body = await resolveBody()

      expect(body).toSatisfy(isAsyncIteratorObject)
      expect(eventStreamMessageQueue).toBeInstanceOf(Queue)
      expect(cleanup).not.toHaveBeenCalled()

      eventStreamMessageQueue?.push({ id: '1', kind: 'event-stream', json: { event: 'message', data: 'hello' } })
      await expect((body as AsyncIteratorClass<any>).next()).resolves.toEqual({ done: false, value: 'hello' })

      eventStreamMessageQueue?.push({ id: '1', kind: 'event-stream', json: { event: 'close', data: 'world' } })
      await expect((body as AsyncIteratorClass<any>).next()).resolves.toEqual({ done: true, value: 'world' })

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('receives a binary download stream', async () => {
      const cleanup = vi.fn()
      const { resolveBody, octetStreamMessageQueue } = toStandardBody(makeMessage({ bodyHint: 'octet-stream' }), cleanup)

      const body = await resolveBody()

      expect(body).toBeInstanceOf(ReadableStream)
      expect(octetStreamMessageQueue).toBeInstanceOf(Queue)
      expect(cleanup).not.toHaveBeenCalled()

      octetStreamMessageQueue?.push({ id: '1', kind: 'octet-stream', json: { close: true }, binary: new Uint8Array([1, 2, 3]) })
      const reader = (body as ReadableStream<Uint8Array<ArrayBuffer>>).getReader()
      expect(await reader.read()).toEqual({ done: false, value: new Uint8Array([1, 2, 3]) })
      expect(await reader.read()).toEqual({ done: true, value: undefined })

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('receives an uploaded file with filename', async () => {
      const binary = new TextEncoder().encode('file content')
      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({
        bodyHint: 'file',
        contentType: 'text/plain',
        contentDisposition: 'attachment; filename="test.txt"',
        binary,
      }), cleanup)

      const body = await resolveBody()

      expect(body).toBeInstanceOf(File)
      expect((body as File).name).toBe('test.txt')
      expect((body as File).type).toBe('text/plain')
      expect(await (body as File).text()).toBe('file content')

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('receives an empty file', async () => {
      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({ bodyHint: 'file' }), cleanup)

      const body = await resolveBody()

      expect(body).toBeInstanceOf(File)
      expect((body as File).size).toBe(0)

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('receives a blob without explicit filename', async () => {
      const binary = new TextEncoder().encode('file content')
      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({
        bodyHint: 'file',
        contentType: 'text/plain',
        binary,
      }), cleanup)

      const body = await resolveBody() as File

      expect(body).toBeInstanceOf(File)
      expect(body.name).toBe('blob')
      expect(body.type).toBe('text/plain')
      expect(await body.text()).toBe('file content')

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('receives a multipart form submission', async () => {
      const form = new FormData()
      form.append('key', 'value')
      const res = new Response(form)
      const contentType = res.headers.get('content-type')!
      const binary = new Uint8Array(await res.arrayBuffer())

      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({
        bodyHint: 'form-data',
        contentType,
        binary,
      }), cleanup)

      const body = await resolveBody()

      expect(body).toBeInstanceOf(FormData)
      expect((body as FormData).get('key')).toBe('value')

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('rejects malformed multipart form data', async () => {
      const binary = new Uint8Array([1, 2, 3])
      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({
        bodyHint: 'form-data',
        binary,
      }), cleanup)

      await expect(resolveBody()).rejects.toThrow()
      expect(cleanup).toHaveBeenCalledWith({ kind: 'error', error: expect.any(Error) })
    })

    it('receives URL-encoded form data', async () => {
      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({
        bodyHint: 'url-search-params',
        body: 'a=1&b=2',
      }), cleanup)

      const body = await resolveBody() as URLSearchParams

      expect(body).toBeInstanceOf(URLSearchParams)
      expect(body.get('a')).toBe('1')
      expect(body.get('b')).toBe('2')

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('explicitly empty body', async () => {
      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({ bodyHint: 'none' }), cleanup)

      const body = await resolveBody()

      expect(body).toBe(undefined)

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('receives a JSON payload', async () => {
      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({
        bodyHint: 'json',
        body: { key: 'val' },
      }), cleanup)

      const body = await resolveBody()

      expect(body).toEqual({ key: 'val' })

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })
  })

  describe('without standard-server hint', () => {
    it('infers event stream from text/event-stream content-type', async () => {
      const cleanup = vi.fn()
      const { resolveBody, eventStreamMessageQueue } = toStandardBody(makeMessage({ contentType: 'text/event-stream' }), cleanup)

      const body = await resolveBody()

      expect(body).toSatisfy(isAsyncIteratorObject)
      expect(eventStreamMessageQueue).toBeInstanceOf(Queue)

      eventStreamMessageQueue?.push({ id: '1', kind: 'event-stream', json: { event: 'close', data: 'data' } })
      await expect((body as AsyncIteratorClass<any>).next()).resolves.toEqual({ done: true, value: 'data' })

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('infers binary stream from application/octet-stream content-type', async () => {
      const cleanup = vi.fn()
      const { resolveBody, octetStreamMessageQueue } = toStandardBody(makeMessage({ contentType: 'application/octet-stream' }), cleanup)

      const body = await resolveBody()

      expect(body).toBeInstanceOf(ReadableStream)
      expect(octetStreamMessageQueue).toBeInstanceOf(Queue)

      octetStreamMessageQueue?.push({ id: '1', kind: 'octet-stream', json: { close: true }, binary: new Uint8Array([1, 2, 3]) })
      const reader = (body as ReadableStream<Uint8Array<ArrayBuffer>>).getReader()
      expect(await reader.read()).toEqual({ done: false, value: new Uint8Array([1, 2, 3]) })
      expect(await reader.read()).toEqual({ done: true, value: undefined })

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('infers form data from multipart/form-data content-type', async () => {
      const form = new FormData()
      form.append('key', 'value')
      const res = new Response(form)
      const contentType = res.headers.get('content-type')!
      const binary = new Uint8Array(await res.arrayBuffer())

      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({
        contentType,
        binary,
      }), cleanup)

      const body = await resolveBody()

      expect(body).toBeInstanceOf(FormData)
      expect((body as FormData).get('key')).toBe('value')

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('infers URL-encoded form data from application/x-www-form-urlencoded content-type', async () => {
      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({
        contentType: 'application/x-www-form-urlencoded',
        body: 'a=1&b=2',
      }), cleanup)

      const body = await resolveBody() as URLSearchParams

      expect(body).toBeInstanceOf(URLSearchParams)
      expect(body.get('a')).toBe('1')
      expect(body.get('b')).toBe('2')

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('returns JSON body when content-type is application/json', async () => {
      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({
        contentType: 'application/json',
        body: { key: 'val' },
      }), cleanup)

      const body = await resolveBody()

      expect(body).toEqual({ key: 'val' })

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })

    it('returns undefined when no content-type and no body', async () => {
      const cleanup = vi.fn()
      const { resolveBody } = toStandardBody(makeMessage({}), cleanup)

      const body = await resolveBody()

      expect(body).toBe(undefined)

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
    })
  })
})

describe('encodeAtomicStandardBody', () => {
  it('encodes undefined body', async () => {
    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(undefined, {})

    expect(jsonBody).toBe(undefined)
    expect(binary).toBe(undefined)
    expect(headers['standard-server']).toBe(undefined)
    expect(headers['content-type']).toBe(undefined)
  })

  it('encodes null body', async () => {
    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(null, {})

    expect(jsonBody).toBe(null)
    expect(binary).toBe(undefined)
    expect(headers['standard-server']).toBe(undefined)
    expect(headers['content-type']).toBe('application/json')
  })

  it('encodes string body', async () => {
    const [jsonBody, headers, binary] = await encodeAtomicStandardBody('hello', {})

    expect(jsonBody).toBe('hello')
    expect(binary).toBe(undefined)
    expect(headers['standard-server']).toBe(undefined)
    expect(headers['content-type']).toBe('application/json')
  })

  it('encodes JSON object body', async () => {
    const [jsonBody, headers, binary] = await encodeAtomicStandardBody({ a: 1, b: [2, 3] }, {})

    expect(jsonBody).toEqual({ a: 1, b: [2, 3] })
    expect(binary).toBe(undefined)
    expect(headers['standard-server']).toBe(undefined)
    expect(headers['content-type']).toBe('application/json')
  })

  it('encodes FormData body', async () => {
    const form = new FormData()
    form.append('key', 'value')

    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(form, {})

    expect(jsonBody).toBe(undefined)
    expect(headers['standard-server']).toBe(undefined)
    expect(headers['content-type']).toContain('multipart/form-data')
    expect(binary).toBeInstanceOf(Blob)
  })

  it('encodes Blob body', async () => {
    const blob = new Blob(['data'], { type: 'text/plain' })
    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(blob, {})

    expect(jsonBody).toBe(undefined)
    expect(headers['standard-server']).toBe('file')
    expect(headers['content-disposition']).toBe(generateContentDisposition('blob'))
    expect(headers['content-type']).toBe('text/plain')
    expect(binary).toBe(blob)
  })

  it('encodes File body with name', async () => {
    const file = new File(['content'], 'myfile.txt', { type: 'text/plain' })
    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(file, {})

    expect(jsonBody).toBe(undefined)
    expect(headers['standard-server']).toBe('file')
    expect(headers['content-disposition']).toBe(generateContentDisposition('myfile.txt'))
    expect(headers['content-type']).toBe('text/plain')
    expect(binary).toBe(file)
  })

  it('encodes Blob body with NaN size without content-length (BunS3 compatibility)', async () => {
    const blob = new Blob(['data'], { type: 'text/plain' })
    Object.defineProperty(blob, 'size', { value: Number.NaN })

    const [, headers] = await encodeAtomicStandardBody(blob, {})

    expect(headers['content-length']).toBe(undefined)
  })

  it('encodes Blob body and preserves existing content-disposition header', async () => {
    const blob = new Blob(['data'])
    const [, headers] = await encodeAtomicStandardBody(blob, { 'content-disposition': 'existing' })
    expect(headers['content-disposition']).toBe('existing')
  })

  it('encodes URLSearchParams body', async () => {
    const params = new URLSearchParams('a=1&b=2')
    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(params, {})

    expect(jsonBody).toBe('a=1&b=2')
    expect(headers['standard-server']).toBe(undefined)
    expect(headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(binary).toBe(undefined)
  })

  it('encodes ReadableStream body', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('stream data'))
        controller.close()
      },
    })

    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(stream, {})

    expect(jsonBody).toBe(undefined)
    expect(headers['standard-server']).toBe('octet-stream')
    expect(headers['content-type']).toBe('application/octet-stream')
    expect(binary).toBe(undefined)
  })

  it('encodes ReadableStream body and preserves existing content-type header', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('stream data'))
        controller.close()
      },
    })

    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(stream, { 'content-type': 'custom/type' })

    expect(jsonBody).toBe(undefined)
    expect(headers['standard-server']).toBe('octet-stream')
    expect(headers['content-type']).toBe('custom/type')
    expect(binary).toBe(undefined)
  })

  it('encodes AsyncIteratorObject body', async () => {
    const asyncIterator = new AsyncIteratorClass(async () => ({ done: true, value: undefined }), async () => {})

    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(asyncIterator, {})

    expect(jsonBody).toBe(undefined)
    expect(headers['standard-server']).toBe(undefined)
    expect(headers['content-type']).toBe('text/event-stream')
    expect(binary).toBe(undefined)
  })

  it('clones headers and does not mutate originals', async () => {
    const originalHeaders: StandardHeaders = { 'x-custom': 'value' }
    const [, headers] = await encodeAtomicStandardBody(undefined, originalHeaders)

    expect(headers).not.toBe(originalHeaders)
    expect(headers['x-custom']).toBe('value')
    expect(originalHeaders['standard-server']).toBeUndefined()
  })
})
