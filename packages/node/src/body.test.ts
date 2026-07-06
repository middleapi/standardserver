import type { StandardBody } from '@standardserver/core'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NodeHttpRequest } from './types'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import * as StandardServerModule from '@standardserver/core'
import { toFetchHeaders } from '@standardserver/fetch'
import { isAsyncIteratorObject } from '@standardserver/shared'
import request from 'supertest'
import { toNodeHttpBody, toStandardBody } from './body'
import * as EventStreamModule from './event-stream'

const toEventStreamSpy = vi.spyOn(EventStreamModule, 'toEventStream')
const generateContentDispositionSpy = vi.spyOn(StandardServerModule, 'generateContentDisposition')
const getFilenameFromContentDispositionSpy = vi.spyOn(StandardServerModule, 'getFilenameFromContentDisposition')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('toStandardBody', () => {
  it('undefined', async () => {
    let standardBody: StandardBody

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)
      res.end()
    }).get('/')

    expect(standardBody).toBe(undefined)

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)
      res.end()
    }).head('/')

    expect(standardBody).toBe(undefined)
  })

  it('ignores body parsing for GET requests even when headers imply a body', async () => {
    const incomingMessage = Readable.from([Buffer.from('{"foo":"bar"}')]) as IncomingMessage
    incomingMessage.method = 'GET'
    incomingMessage.headers = {
      'content-type': 'application/json',
    }

    expect(await toStandardBody(incomingMessage as NodeHttpRequest)).toBe(undefined)
  })

  it('json', async () => {
    let standardBody: StandardBody = {} as any

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)
      res.end()
    }).post('/').send({ foo: 'bar' })

    expect(standardBody).toEqual({ foo: 'bar' })
  })

  it('json but empty body', async () => {
    let standardBody: StandardBody = {} as any

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)
      res.end()
    }).post('/').type('application/json').send('')

    expect(standardBody).toEqual(undefined)
  })

  it('async iterator object', async () => {
    let standardBody: any

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)

      res.end()
    })
      .delete('/')
      .type('text/event-stream')
      .send('event: message\ndata: 123\n\nevent: close\ndata: 456\n\n')

    expect(standardBody).toSatisfy(isAsyncIteratorObject)

    expect(await standardBody.next()).toEqual({ done: false, value: 123 })
    expect(await standardBody.next()).toEqual({ done: true, value: 456 })
  })

  it('text', async () => {
    let standardBody: any

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)
      res.end()
    })
      .delete('/')
      .type('text/plain')
      .send('foo')

    expect(standardBody).toBeInstanceOf(File)
    expect(standardBody.type).toBe('text/plain')
    expect(await standardBody.text()).toBe('foo')
  })

  it('form-data', async () => {
    let standardBody: any

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)
      res.end()
    })
      .delete('/')
      .field('foo', 'bar')
      .field('bar', 'baz')

    expect(standardBody).toBeInstanceOf(FormData)
    expect(standardBody.get('foo')).toBe('bar')
    expect(standardBody.get('bar')).toBe('baz')
  })

  it('url-search-params', async () => {
    let standardBody: any

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)
      res.end()
    })
      .delete('/')
      .send('foo=bar&bar=baz')

    expect(standardBody).toEqual(new URLSearchParams('foo=bar&bar=baz'))
  })

  it('blob', async () => {
    let standardBody: any

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)
      res.end()
    })
      .delete('/')
      .type('application/pdf')
      .send(Buffer.from('foo'))

    expect(standardBody).toBeInstanceOf(File)
    expect(standardBody.name).toBe('blob')
    expect(standardBody.type).toBe('application/pdf')
    expect(await standardBody.text()).toBe('foo')

    expect(getFilenameFromContentDispositionSpy).toHaveBeenCalledTimes(0)
  })

  it('file', async () => {
    let standardBody: any

    getFilenameFromContentDispositionSpy.mockReturnValue('__name__')

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)
      res.end()
    })
      .delete('/')
      .type('plain/text')
      .set('content-disposition', 'attachment; filename="foo.pdf"')
      .send('{"value":123}')

    expect(standardBody).toBeInstanceOf(File)
    expect(standardBody.name).toBe('__name__')
    expect(standardBody.type).toBe('plain/text')
    expect(await standardBody.text()).toBe('{"value":123}')

    expect(getFilenameFromContentDispositionSpy).toHaveBeenCalledTimes(1)
    expect(getFilenameFromContentDispositionSpy).toHaveBeenCalledWith('attachment; filename="foo.pdf"')
  })

  it('file without disposition', async () => {
    let standardBody: any

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)
      res.end()
    })
      .delete('/')
      .type('application/pdf')
      .set('content-length', Buffer.from('foo').length.toString())
      .send(Buffer.from('foo'))

    expect(standardBody).toBeInstanceOf(File)
    expect(standardBody.name).toBe('blob')
    expect(standardBody.type).toBe('application/pdf')
    expect(await standardBody.text()).toBe('foo')

    expect(getFilenameFromContentDispositionSpy).toHaveBeenCalledTimes(0)
  })

  it('file without content-type', async () => {
    const incomingMessage = Readable.from([Buffer.from('foo')]) as IncomingMessage
    incomingMessage.method = 'POST'
    incomingMessage.headers = {
      'content-length': '3',
    }

    const standardBody = await toStandardBody(incomingMessage as NodeHttpRequest)

    expect(standardBody).toBeInstanceOf(File)
    expect((standardBody as File).name).toBe('blob')
    expect((standardBody as File).type).toBe('')
    expect(await (standardBody as File).text()).toBe('foo')
  })

  it('prefer parsed body', async () => {
    let standardBody: StandardBody = {} as any

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      // @ts-expect-error fake body is parsed
      req.body = { value: 123 }
      standardBody = await toStandardBody(req)
      res.end()
    }).post('/').send()

    expect(standardBody).toEqual({ value: 123 })
  })

  describe('body hint', () => {
    it('undefined', async () => {
      let standardBody: StandardBody

      await request(async (req: IncomingMessage, res: ServerResponse) => {
        standardBody = await toStandardBody(req)
        res.end()
      })
        .post('/')
        .set('standard-server', 'none')
        .send('body')

      expect(standardBody).toBe(undefined)
    })

    it('json', async () => {
      let standardBody: StandardBody = {} as any

      await request(async (req: IncomingMessage, res: ServerResponse) => {
        standardBody = await toStandardBody(req)
        res.end()
      })
        .post('/')
        .set('standard-server', 'json')
        .send('{"foo":"bar"}')

      expect(standardBody).toEqual({ foo: 'bar' })
    })

    it('async iterator object', async () => {
      let standardBody: any

      await request(async (req: IncomingMessage, res: ServerResponse) => {
        standardBody = await toStandardBody(req)
        res.end()
      })
        .delete('/')
        .set('standard-server', 'event-stream')
        .send('event: message\ndata: 123\n\nevent: close\ndata: 456\n\n')

      expect(standardBody).toSatisfy(isAsyncIteratorObject)
      expect(await standardBody.next()).toEqual({ done: false, value: 123 })
      expect(await standardBody.next()).toEqual({ done: true, value: 456 })
    })

    it('form-data', async () => {
      let standardBody: any

      await request(async (req: IncomingMessage, res: ServerResponse) => {
        standardBody = await toStandardBody(req)
        res.end()
      })
        .delete('/')
        .set('standard-server', 'form-data')
        .field('foo', 'bar')
        .field('bar', 'baz')

      expect(standardBody).toBeInstanceOf(FormData)
      expect(standardBody.get('foo')).toBe('bar')
      expect(standardBody.get('bar')).toBe('baz')
    })

    it('url-search-params', async () => {
      let standardBody: any

      await request(async (req: IncomingMessage, res: ServerResponse) => {
        standardBody = await toStandardBody(req)
        res.end()
      })
        .delete('/')
        .set('standard-server', 'url-search-params')
        .send('foo=bar&bar=baz')

      expect(standardBody).toEqual(new URLSearchParams('foo=bar&bar=baz'))
    })

    it('file/blob', async () => {
      let standardBody: any

      await request(async (req: IncomingMessage, res: ServerResponse) => {
        standardBody = await toStandardBody(req)
        res.end()
      })
        .post('/')
        .set('standard-server', 'file')
        .send('foo')

      expect(standardBody).toBeInstanceOf(File)
      expect(await standardBody.text()).toBe('foo')
    })

    it('prefer parsed body', async () => {
      let standardBody: StandardBody = {} as any

      await request(async (req: IncomingMessage, res: ServerResponse) => {
      // @ts-expect-error fake body is parsed
        req.body = { value: 123 }
        standardBody = await toStandardBody(req)
        res.end()
      })
        .post('/')
        .set('standard-server', 'file')
        .send(Buffer.from('foo'))

      expect(standardBody).toEqual({ value: 123 })
    })
  })

  describe('handle utf-8 characters split across stream chunks', () => {
    function createChunkedIncomingMessage(method: string, contentType: string, chunks: Array<Buffer | string>): IncomingMessage {
      const request = Readable.from(chunks) as IncomingMessage
      request.method = method
      request.headers = {
        'content-type': contentType,
      }
      return request
    }

    it('json: 4-byte emoji split after first byte', async () => {
      const bytes = Buffer.from('{"emoji":"😀"}', 'utf-8')
      const splitAt = Buffer.from('{"emoji":"').length + 1 // one byte into the emoji codepoint
      const chunks = [bytes.subarray(0, splitAt), bytes.subarray(splitAt)]

      const incomingMessage = createChunkedIncomingMessage('POST', 'application/json', chunks)
      const result = await toStandardBody(incomingMessage)
      expect(result).toEqual({ emoji: '😀' })
    })

    it('url-search-params: 4-byte emoji split after first byte', async () => {
      const bytes = Buffer.from('emoji=😀', 'utf-8')
      const splitAt = Buffer.from('emoji=').length + 1 // one byte into the emoji codepoint
      const chunks = [bytes.subarray(0, splitAt), bytes.subarray(splitAt)]

      const incomingMessage = createChunkedIncomingMessage('POST', 'application/x-www-form-urlencoded', chunks)
      const result = await toStandardBody(incomingMessage)
      expect(result).toEqual(new URLSearchParams('emoji=😀'))
    })

    it('url-search-params: end with incomplete 4-byte emoji', async () => {
      const bytes = Buffer.from('emoji=😀', 'utf-8')
      const chunks = [bytes.subarray(0, bytes.length - 1)] // emoji missing last byte

      const incomingMessage = createChunkedIncomingMessage('POST', 'application/x-www-form-urlencoded', chunks)
      const result = await toStandardBody(incomingMessage)
      expect(result).toEqual(new URLSearchParams('emoji=�'))
    })

    it('json: string chunks', async () => {
      const incomingMessage = createChunkedIncomingMessage('POST', 'application/json', ['{"emoji":"', '😀"}'])
      const result = await toStandardBody(incomingMessage)
      expect(result).toEqual({ emoji: '😀' })
    })
  })

  describe('edge case', () => {
    it('throw on read body multiple time except (hint=none)', async () => {
      let req: NodeHttpRequest

      await request(async (_req: IncomingMessage, res: ServerResponse) => {
        req = _req as NodeHttpRequest
        // first read
        await toStandardBody(req)
        res.end()
      })
        .post('/')
        .send({ foo: 'bar' })

      await expect(toStandardBody(req!)).rejects.toThrow('Failed to read body: body stream already read')
      expect(await toStandardBody(req!, { hint: 'none' })).toBe(undefined)
    })

    it('prefers user defined body hint over standard-server header', async () => {
      let standardBody: any

      await request(async (req: IncomingMessage, res: ServerResponse) => {
        standardBody = await toStandardBody(req, { hint: 'octet-stream' })
        res.end()
      })
        .post('/')
        .set('content-length', '567')
        .set('standard-server', 'file') // low priority
        .send('hello')

      expect(standardBody).toBeInstanceOf(ReadableStream)
      const reader = (standardBody as ReadableStream).pipeThrough(new TextDecoderStream()).getReader()
      expect(await reader.read()).toEqual({ done: false, value: 'hello' })
    })

    it('parse as stream if invalid body hint', async () => {
      let standardBody: any

      await request(async (req: IncomingMessage, res: ServerResponse) => {
        standardBody = await toStandardBody(req)
        res.end()
      })
        .post('/')
        .set('standard-server', 'invalid')
        .send('raw data')

      expect(standardBody).toBeInstanceOf(ReadableStream)
      const reader = (standardBody as ReadableStream).pipeThrough(new TextDecoderStream()).getReader()
      expect(await reader.read()).toEqual({ done: false, value: 'raw data' })
    })
  })
})

describe('toNodeHttpBody', () => {
  const baseHeaders = {
    'x-custom-header': 'custom-value',
  }

  it('undefined', async () => {
    const [body, headers] = await toNodeHttpBody(undefined, baseHeaders, {})

    expect(body).toBe(undefined)
    expect(headers).toEqual({
      'x-custom-header': 'custom-value',
    })
  })

  it('json', async () => {
    const [body, headers] = await toNodeHttpBody({ foo: 'bar' }, baseHeaders, {})

    expect(body).toBe('{"foo":"bar"}')
    expect(headers).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'custom-value',
    })
  })

  it('form-data', async () => {
    const form = new FormData()
    form.append('foo', 'bar')
    form.append('bar', 'baz')

    const [body, headers] = await toNodeHttpBody(form, baseHeaders, {})

    expect(body).toBeInstanceOf(Readable)
    expect(headers).toEqual({
      'x-custom-header': 'custom-value',
      'content-type': expect.stringMatching(/multipart\/form-data;.+/),
    })

    const response = new Response(body, {
      headers: toFetchHeaders(headers),
    })
    const resForm = await response.formData()

    expect(resForm.get('foo')).toBe('bar')
    expect(resForm.get('bar')).toBe('baz')
  })

  it('url-search-params', async () => {
    const query = new URLSearchParams('foo=bar&bar=baz')

    const [body, headers] = await toNodeHttpBody(query, baseHeaders, {})

    expect(body).toBe('foo=bar&bar=baz')
    expect(headers).toEqual({
      'x-custom-header': 'custom-value',
      'content-type': 'application/x-www-form-urlencoded',
    })
  })

  it('blob', async () => {
    const blob = new Blob(['foo'], { type: 'application/pdf' })

    generateContentDispositionSpy.mockReturnValue('__mocked__')

    const [body, headers] = await toNodeHttpBody(blob, baseHeaders, {})

    expect(body).toBeInstanceOf(Readable)
    expect(headers).toEqual({
      'content-disposition': '__mocked__',
      'content-length': '3',
      'content-type': 'application/pdf',
      'x-custom-header': 'custom-value',
      'standard-server': 'file',
    })

    expect(generateContentDispositionSpy).toHaveBeenCalledTimes(1)
    expect(generateContentDispositionSpy).toHaveBeenCalledWith('blob')

    const response = new Response(body, {
      headers: toFetchHeaders(headers),
    })
    const resBlob = await response.blob()

    expect(resBlob.type).toBe('application/pdf')
    expect(await resBlob.text()).toBe('foo')
  })

  it('file', async () => {
    const blob = new File(['foo'], 'foo.pdf', { type: 'application/pdf' })

    generateContentDispositionSpy.mockReturnValue('__mocked__')

    const [body, headers] = await toNodeHttpBody(blob, baseHeaders, {})

    expect(body).instanceOf(Readable)
    expect(headers).toEqual({
      'content-disposition': '__mocked__',
      'content-length': '3',
      'content-type': 'application/pdf',
      'x-custom-header': 'custom-value',
      'standard-server': 'file',
    })

    expect(generateContentDispositionSpy).toHaveBeenCalledTimes(1)
    expect(generateContentDispositionSpy).toHaveBeenCalledWith('foo.pdf')

    const response = new Response(body, {
      headers: toFetchHeaders(headers),
    })
    const resBlob = await response.blob()

    expect(resBlob.type).toBe('application/pdf')
    expect(await resBlob.text()).toBe('foo')
  })

  it('file with existing content-disposition headers', async () => {
    const headersBase = { ...baseHeaders, 'content-disposition': 'attachment; filename="foo.pdf"' }
    const blob = new File(['foo'], 'foo.pdf', { type: 'application/pdf' })

    const [body, headers] = await toNodeHttpBody(blob, headersBase, {})

    expect(body).instanceOf(Readable)
    expect(headers).toEqual({
      'content-disposition': 'attachment; filename="foo.pdf"',
      'content-length': '3',
      'content-type': 'application/pdf',
      'x-custom-header': 'custom-value',
      'standard-server': 'file',
    })

    expect(generateContentDispositionSpy).toHaveBeenCalledTimes(0)

    const response = new Response(body, {
      headers: toFetchHeaders(headers),
    })
    const resBlob = await response.blob()

    expect(resBlob.type).toBe('application/pdf')
    expect(await resBlob.text()).toBe('foo')
  })

  it('file with size=nan', async () => {
    const file = new File(['foo'], 'foo.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', { value: Number.NaN })

    generateContentDispositionSpy.mockReturnValue('__mocked__')

    const [body, headers] = await toNodeHttpBody(file, baseHeaders, {})

    expect(body).toBeInstanceOf(Readable)
    expect(headers).toEqual({
      'content-disposition': '__mocked__',
      'content-length': undefined,
      'content-type': 'application/pdf',
      'x-custom-header': 'custom-value',
      'standard-server': 'file',
    })

    expect(generateContentDispositionSpy).toHaveBeenCalledTimes(1)
    expect(generateContentDispositionSpy).toHaveBeenCalledWith('foo.pdf')
  })

  it('event stream', async () => {
    async function* gen() {
      yield 123
      return 456
    }
    const options = { eventStream: { keepAlive: { enabled: true } } }
    const iterator = gen()
    const [body, headers] = await toNodeHttpBody(iterator, baseHeaders, options)

    expect(toEventStreamSpy).toHaveBeenCalledWith(iterator, options.eventStream)

    expect(body).toBeInstanceOf(Readable)
    expect(headers).toEqual({
      'content-type': 'text/event-stream',
      'x-custom-header': 'custom-value',
    })

    const reader = Readable.toWeb((body as Readable)).pipeThrough(new TextDecoderStream()).getReader()

    expect(await reader.read()).toEqual({ done: false, value: ': \n\n' })
    expect(await reader.read()).toEqual({ done: false, value: 'event: message\ndata: 123\n\n' })
    expect(await reader.read()).toEqual({ done: false, value: 'event: close\ndata: 456\n\n' })
    expect(await reader.read()).toEqual({ done: true })
  })

  it('octet stream', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('order1'))
        controller.enqueue(new TextEncoder().encode('order2'))
        controller.enqueue(new TextEncoder().encode('order3'))
        controller.close()
      },
    })
    const [body, headers] = await toNodeHttpBody(stream, baseHeaders)

    expect(body).toBeInstanceOf(Readable)
    expect(headers).toEqual({
      'content-type': 'application/octet-stream',
      'x-custom-header': 'custom-value',
      'standard-server': 'octet-stream',
    })

    const reader = Readable.toWeb((body as Readable)).pipeThrough(new TextDecoderStream()).getReader()

    expect(await reader.read()).toEqual({ done: false, value: 'order1' })
    expect(await reader.read()).toEqual({ done: false, value: 'order2' })
    expect(await reader.read()).toEqual({ done: false, value: 'order3' })
    expect(await reader.read()).toEqual({ done: true })
  })

  describe('override auto-set headers with empty array', () => {
    it('readable stream: unset content-type, and standard-server', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello'))
          controller.close()
        },
      })
      const [body, headers] = await toNodeHttpBody(stream, {
        ...baseHeaders,
        'content-type': [],
        'standard-server': [],
      })

      expect(body).toBeInstanceOf(Readable)
      expect(headers).toEqual({
        'content-type': [],
        'x-custom-header': 'custom-value',
        'standard-server': [],
      })

      const fetchHeaders = toFetchHeaders(headers)
      expect(fetchHeaders.has('content-type')).toBe(false)
      expect(fetchHeaders.has('standard-server')).toBe(false)
    })

    it('blob: unset standard-server, and content-disposition', async () => {
      const blob = new Blob(['foo'], { type: 'application/pdf' })
      const [body, headers] = await toNodeHttpBody(blob, {
        ...baseHeaders,
        'standard-server': [],
        'content-disposition': [],
      })

      expect(body).toBeInstanceOf(Readable)
      expect(headers).toEqual({
        'content-length': '3',
        'content-type': 'application/pdf',
        'x-custom-header': 'custom-value',
        'standard-server': [],
        'content-disposition': [],
      })

      const fetchHeaders = toFetchHeaders(headers)
      expect(fetchHeaders.has('standard-server')).toBe(false)
      expect(fetchHeaders.has('content-disposition')).toBe(false)
    })
  })
})
