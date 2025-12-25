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
import * as EventIteratorModule from './event-iterator'

const toEventStreamSpy = vi.spyOn(EventIteratorModule, 'toEventStream')
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

    await request(async (req: IncomingMessage, res: ServerResponse) => {
      standardBody = await toStandardBody(req)
      res.end()
    }).post('/')
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

  it('event iterator', async () => {
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
      .type('application/json')
      .set('content-disposition', 'attachment; filename="foo.pdf"')
      .send({ value: 123 })

    expect(standardBody).toBeInstanceOf(File)
    expect(standardBody.name).toBe('__name__')
    expect(standardBody.type).toBe('application/json')
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

    it('event iterator', async () => {
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

    it('fallback to user defined body hint', async () => {
      let standardBody: any

      await request(async (req: IncomingMessage, res: ServerResponse) => {
        standardBody = await toStandardBody(req, { hint: 'stream' })
        res.end()
      })
        .post('/')
        .set('content-length', '567')
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
    'content-type': 'application/json',
    'x-custom-header': 'custom-value',
  }

  it('undefined', () => {
    const [body, headers] = toNodeHttpBody(undefined, baseHeaders, {})

    expect(body).toBe(undefined)
    expect(headers).toEqual({
      'x-custom-header': 'custom-value',
      'standard-server': 'none',
    })
  })

  it('json', () => {
    const [body, headers] = toNodeHttpBody({ foo: 'bar' }, baseHeaders, {})

    expect(body).toBe('{"foo":"bar"}')
    expect(headers).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'custom-value',
      'standard-server': 'json',
    })
  })

  it('form-data', async () => {
    const form = new FormData()
    form.append('foo', 'bar')
    form.append('bar', 'baz')

    const [body, headers] = toNodeHttpBody(form, baseHeaders, {})

    expect(body).toBeInstanceOf(Readable)
    expect(headers).toEqual({
      'x-custom-header': 'custom-value',
      'standard-server': 'form-data',
      'content-type': expect.stringMatching(/multipart\/form-data; .+/),
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

    const [body, headers] = toNodeHttpBody(query, baseHeaders, {})

    expect(body).toBe('foo=bar&bar=baz')
    expect(headers).toEqual({
      'x-custom-header': 'custom-value',
      'standard-server': 'url-search-params',
      'content-type': 'application/x-www-form-urlencoded',
    })
  })

  it('blob', async () => {
    const blob = new Blob(['foo'], { type: 'application/pdf' })

    generateContentDispositionSpy.mockReturnValue('__mocked__')

    const [body, headers] = toNodeHttpBody(blob, baseHeaders, {})

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

    const [body, headers] = toNodeHttpBody(blob, baseHeaders, {})

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

  it('file with content-disposition', async () => {
    const headersBase = { ...baseHeaders, 'content-disposition': 'attachment; filename="foo.pdf"' }
    const blob = new File(['foo'], 'foo.pdf', { type: 'application/pdf' })

    const [body, headers] = toNodeHttpBody(blob, headersBase, {})

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

    const [body, headers] = toNodeHttpBody(file, baseHeaders, {})

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

  it('async generator', async () => {
    async function* gen() {
      yield 123
      return 456
    }
    const options = { eventIterator: { keepAliveEnabled: true } }
    const iterator = gen()
    const [body, headers] = toNodeHttpBody(iterator, baseHeaders, options)

    expect(toEventStreamSpy).toHaveBeenCalledWith(iterator, options.eventIterator)

    expect(body).toBeInstanceOf(Readable)
    expect(headers).toEqual({
      'content-type': 'text/event-stream',
      'x-custom-header': 'custom-value',
      'standard-server': 'event-stream',
    })

    const reader = Readable.toWeb((body as Readable)).pipeThrough(new TextDecoderStream()).getReader()

    expect(await reader.read()).toEqual({ done: false, value: ': \n\n' })
    expect(await reader.read()).toEqual({ done: false, value: 'event: message\ndata: 123\n\n' })
    expect(await reader.read()).toEqual({ done: false, value: 'event: close\ndata: 456\n\n' })
    expect(await reader.read()).toEqual({ done: true })
  })
})
