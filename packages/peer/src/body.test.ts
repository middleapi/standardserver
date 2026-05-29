import type { StandardHeaders } from '@standardserver/core'
import type { PeerRequestMessage } from './types'
import { generateContentDisposition } from '@standardserver/core'
import { AsyncIteratorClass, isAsyncIteratorObject, Queue } from '@standardserver/shared'
import { encodeAtomicStandardBody, toStandardBody } from './body'

describe('encodeAtomicStandardBody', () => {
  it.each([
    ['undefined', undefined, undefined],
    ['string', 'hello', 'hello'],
    ['JSON object', { a: 1, b: [2, 3] }, { a: 1, b: [2, 3] }],
  ] as const)('encodes %s body as JSON (no hint, no binary)', async (_, body, expectedJson) => {
    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(body, {})

    expect(jsonBody).toEqual(expectedJson)
    expect(headers['standard-server']).toBe(undefined)
    expect(binary).toBe(undefined)
  })

  it.each([
    ['ReadableStream', () => new ReadableStream(), 'octet-stream'],
    ['AsyncIterator', () => new AsyncIteratorClass(async () => ({ done: true, value: undefined }), async () => {}), 'event-stream'],
  ])('encodes %s body as streaming (hint=%s, no binary)', async (_, createBody, expectedHint) => {
    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(createBody() as any, {})

    expect(jsonBody).toBe(undefined)
    expect(headers['standard-server']).toBe(expectedHint)
    expect(binary).toBe(undefined)
  })

  it('encodes FormData body', async () => {
    const form = new FormData()
    form.append('key', 'value')

    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(form, {})

    expect(jsonBody).toBe(undefined)
    expect(headers['standard-server']).toBe('form-data')
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

  it('encodes URLSearchParams body', async () => {
    const params = new URLSearchParams('a=1&b=2')
    const [jsonBody, headers, binary] = await encodeAtomicStandardBody(params, {})

    expect(jsonBody).toBe('a=1&b=2')
    expect(headers['standard-server']).toBe('url-search-params')
    expect(binary).toBe(undefined)
  })

  it('clones headers and does not mutate originals', async () => {
    const originalHeaders: StandardHeaders = { 'x-custom': 'value' }
    const [, headers] = await encodeAtomicStandardBody(undefined, originalHeaders)

    expect(headers).not.toBe(originalHeaders)
    expect(headers['x-custom']).toBe('value')
    expect(originalHeaders['standard-server']).toBeUndefined()
  })

  it('preserves existing content-type for FormData', async () => {
    const form = new FormData()
    form.append('key', 'val')
    const [, headers] = await encodeAtomicStandardBody(form, { 'content-type': 'existing' })

    expect(headers['content-type']).toBe('existing')
  })

  it('preserves existing content-disposition for Blob', async () => {
    const blob = new Blob(['data'])
    const [, headers] = await encodeAtomicStandardBody(blob, { 'content-disposition': 'existing' })

    expect(headers['content-disposition']).toBe('existing')
  })
})

describe('toStandardBody', () => {
  function makeMessage(bodyHint: string | undefined, body?: unknown, binary?: Uint8Array<ArrayBuffer>): PeerRequestMessage {
    const headers: StandardHeaders = {}
    if (bodyHint) {
      headers['standard-server'] = bodyHint
    }
    return {
      id: '1',
      kind: 'request',
      json: { method: 'POST', url: '/test', headers, body },
      binary,
    }
  }

  it('decodes event-stream hint to AsyncIterator', async () => {
    const cleanup = vi.fn()

    const { resolveBody, eventStreamMessageQueue } = toStandardBody(makeMessage('event-stream'), cleanup)

    expect(cleanup).toHaveBeenCalledTimes(0)
    const body = await resolveBody()

    expect(body).toSatisfy(isAsyncIteratorObject)
    expect(eventStreamMessageQueue).toBeInstanceOf(Queue)
    expect(cleanup).not.toHaveBeenCalled()

    eventStreamMessageQueue?.push({ id: '1', kind: 'event-stream', json: { event: 'close', data: 'data' } })
    await expect((body as AsyncIteratorClass<any>).next()).resolves.toEqual({ done: true, value: 'data' })

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
  })

  it('decodes octet-stream hint to ReadableStream', async () => {
    const cleanup = vi.fn()

    const { resolveBody, octetStreamMessageQueue } = toStandardBody(makeMessage('octet-stream'), cleanup)

    expect(cleanup).toHaveBeenCalledTimes(0)
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

  it('decodes file hint to File', async () => {
    const binary = new TextEncoder().encode('file content')
    const message = makeMessage('file', undefined, binary)
    message.json.headers['content-disposition'] = 'attachment; filename="test.txt"'
    message.json.headers['content-type'] = 'text/plain'

    const cleanup = vi.fn()
    const { resolveBody } = toStandardBody(message, cleanup)

    expect(cleanup).toHaveBeenCalledTimes(0)
    const body = await resolveBody()

    expect(body).toBeInstanceOf(File)
    expect((body as File).name).toBe('test.txt')
    expect((body as File).type).toBe('text/plain')
    expect(await (body as File).text()).toBe('file content')

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
  })

  it('decodes file hint with no binary', async () => {
    const cleanup = vi.fn()
    const { resolveBody } = toStandardBody(makeMessage('file'), cleanup)

    expect(cleanup).toHaveBeenCalledTimes(0)
    const body = await resolveBody()

    expect(body).toBeInstanceOf(File)
    expect((body as File).size).toBe(0)

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
  })

  it('decodes file hint to File without content-disposition', async () => {
    const binary = new TextEncoder().encode('file content')
    const message = makeMessage('file', undefined, binary)
    message.json.headers['content-disposition'] = undefined
    message.json.headers['content-type'] = 'text/plain'

    const cleanup = vi.fn()
    const { resolveBody } = toStandardBody(message, cleanup)

    expect(cleanup).toHaveBeenCalledTimes(0)
    const body = await resolveBody() as File

    expect(body).toBeInstanceOf(File)
    expect(body.name).toBe('blob')
    expect(body.type).toBe('text/plain')
    expect(await body.text()).toBe('file content')

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
  })

  it('decodes form-data hint to FormData', async () => {
    // Build a proper multipart/form-data binary payload using the Response/FormData API
    const form = new FormData()
    form.append('key', 'value')
    const res = new Response(form)
    const contentType = res.headers.get('content-type')!
    const binary = new Uint8Array(await res.arrayBuffer())

    const message = makeMessage('form-data', undefined, binary)
    message.json.headers['content-type'] = contentType

    const cleanup = vi.fn()
    const { resolveBody } = toStandardBody(message, cleanup)

    expect(cleanup).toHaveBeenCalledTimes(0)
    const body = await resolveBody()

    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('key')).toBe('value')

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
  })

  it('decodes form-data hint resolveBody throw on invalid data', async () => {
    const binary = new Uint8Array([1, 2, 3]) // Invalid form-data binary

    const message = makeMessage('form-data', undefined, binary)

    const cleanup = vi.fn()
    const { resolveBody } = toStandardBody(message, cleanup)

    await expect(resolveBody()).rejects.toThrow()
    expect(cleanup).toHaveBeenCalledWith({ kind: 'error', error: expect.any(Error) })
  })

  it('decodes url-search-params hint', async () => {
    const cleanup = vi.fn()
    const { resolveBody } = toStandardBody(
      makeMessage('url-search-params', 'a=1&b=2'),
      cleanup,
    )

    expect(cleanup).toHaveBeenCalledTimes(0)
    const body = await resolveBody() as URLSearchParams

    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('a')).toBe('1')
    expect(body.get('b')).toBe('2')

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
  })

  it('decodes default (JSON) body', async () => {
    const cleanup = vi.fn()
    const { resolveBody } = await toStandardBody(
      makeMessage(undefined, { key: 'val' }),
      cleanup,
    )

    expect(cleanup).toHaveBeenCalledTimes(0)
    const body = await resolveBody()

    expect(body).toEqual({ key: 'val' })

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
  })

  it('decodes undefined body', async () => {
    const cleanup = vi.fn()
    const { resolveBody } = await toStandardBody(
      makeMessage(undefined, undefined),
      cleanup,
    )

    expect(cleanup).toHaveBeenCalledTimes(0)
    const body = await resolveBody()

    expect(body).toBe(undefined)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledWith({ kind: 'success' })
  })
})
