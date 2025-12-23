import * as StandardServerModule from '@standardserver/core'
import { isAsyncIteratorObject } from '@standardserver/shared'
import { toFetchBody, toStandardBody } from './body'
import * as EventIteratorModule from './event-iterator'

const generateContentDispositionSpy = vi.spyOn(StandardServerModule, 'generateContentDisposition')
const getFilenameFromContentDispositionSpy = vi.spyOn(StandardServerModule, 'getFilenameFromContentDisposition')
const toEventStreamSpy = vi.spyOn(EventIteratorModule, 'toEventStream')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('toStandardBody', () => {
  it('undefined', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: null,
    })

    expect(await toStandardBody(request)).toBe(undefined)
  })

  it('json', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' }),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(await toStandardBody(request)).toEqual({ foo: 'bar' })
  })

  it('json but empty body', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: '',
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(await toStandardBody(request)).toEqual(undefined)
  })

  it('event iterator', async () => {
    const stream = new ReadableStream<string>({
      async pull(controller) {
        controller.enqueue('event: message\ndata: 123\n\n')
        controller.enqueue('event: close\ndata: 456\n\n')
        controller.close()
      },
    }).pipeThrough(new TextEncoderStream())

    const request = new Request('https://example.com', {
      method: 'POST',
      body: stream,
      headers: {
        'content-type': 'text/event-stream',
      },
      duplex: 'half',
    })

    const standardBody = await toStandardBody(request) as any
    expect(standardBody).toSatisfy(isAsyncIteratorObject)

    expect(await standardBody.next()).toEqual({ done: false, value: 123 })
    expect(await standardBody.next()).toEqual({ done: true, value: 456 })
  })

  it('form-data', async () => {
    const form = new FormData()
    form.append('foo', 'bar')
    form.append('bar', 'baz')

    const request = new Request('https://example.com', {
      method: 'POST',
      body: form,
    })

    const standardForm = await toStandardBody(request) as any

    expect(standardForm).toBeInstanceOf(FormData)
    expect(standardForm.get('foo')).toBe('bar')
    expect(standardForm.get('bar')).toBe('baz')
  })

  it('url-search-params', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: 'foo=bar&bar=baz',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    })

    expect(await toStandardBody(request)).toEqual(new URLSearchParams('foo=bar&bar=baz'))
  })

  it('blob', async () => {
    const blob = new Blob(['foo'], { type: 'application/pdf' })
    const request = new Request('https://example.com', {
      method: 'POST',
      body: blob,
      headers: {
        'content-type': blob.type,
        'content-length': blob.size.toString(),
      },
    })

    const standardBlob = await toStandardBody(request) as any
    expect(standardBlob).toBeInstanceOf(File)
    expect(standardBlob.name).toBe('blob')
    expect(standardBlob.type).toBe('application/pdf')
    expect(await standardBlob.text()).toBe('foo')

    expect(getFilenameFromContentDispositionSpy).toHaveBeenCalledTimes(0)
  })

  it('file', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: new Blob(['{"value":123}'], { type: 'application/json' }),
      headers: {
        'content-disposition': 'attachment; filename="foo.pdf"',
      },
    })

    getFilenameFromContentDispositionSpy.mockReturnValue('__name__')

    const standardFile = await toStandardBody(request) as any
    expect(standardFile).toBeInstanceOf(File)
    expect(standardFile.name).toBe('__name__')
    expect(standardFile.type).toBe('application/json')
    expect(await standardFile.text()).toBe('{"value":123}')

    expect(getFilenameFromContentDispositionSpy).toHaveBeenCalledTimes(1)
    expect(getFilenameFromContentDispositionSpy).toHaveBeenCalledWith('attachment; filename="foo.pdf"')
  })

  it('stream', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello'))
        controller.close()
      },
    })
    const request = new Request('https://example.com', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    })

    const standardBody = await toStandardBody(request)
    expect(standardBody).toBeInstanceOf(ReadableStream)
    const reader = (standardBody as ReadableStream).pipeThrough(new TextDecoderStream()).getReader()
    expect(await reader.read()).toEqual({ done: false, value: 'hello' })
    expect(await reader.read()).toEqual({ done: true, value: undefined })
  })

  describe('body hint', () => {
    it('undefined', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: 'body',
        headers: {
          'standard-server': 'none',
        },
      })

      expect(await toStandardBody(request)).toBe(undefined)
    })

    it('json', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: '{"foo":"bar"}',
        headers: {
          'standard-server': 'json',
        },
      })

      expect(await toStandardBody(request)).toEqual({ foo: 'bar' })
    })

    it('event iterator', async () => {
      const stream = new ReadableStream<string>({
        async pull(controller) {
          controller.enqueue('event: message\ndata: 123\n\n')
          controller.enqueue('event: close\ndata: 456\n\n')
          controller.close()
        },
      }).pipeThrough(new TextEncoderStream())

      const request = new Request('https://example.com', {
        method: 'POST',
        body: stream,
        headers: {
          'standard-server': 'event-stream',
        },
        duplex: 'half',
      })

      const standardBody = await toStandardBody(request) as any
      expect(standardBody).toSatisfy(isAsyncIteratorObject)

      expect(await standardBody.next()).toEqual({ done: false, value: 123 })
      expect(await standardBody.next()).toEqual({ done: true, value: 456 })
    })

    it('form-data', async () => {
      const form = new FormData()
      form.append('foo', 'bar')
      form.append('bar', 'baz')

      const request = new Request('https://example.com', {
        method: 'POST',
        body: form,
        headers: {
          'standard-server': 'form-data',
        },
      })

      const result: any = await toStandardBody(request)

      expect(result).toBeInstanceOf(FormData)
      expect(result.get('foo')).toBe('bar')
      expect(result.get('bar')).toBe('baz')
    })

    it('url-search-params', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: 'foo=bar&bar=baz',
        headers: {
          'standard-server': 'url-search-params',
        },
      })

      expect(await toStandardBody(request)).toEqual(new URLSearchParams('foo=bar&bar=baz'))
    })

    it('file/blob', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: 'foo',
        headers: {
          'standard-server': 'file',
        },
      })

      const result: any = await toStandardBody(request)

      expect(result).toBeInstanceOf(File)
      expect(await result.text()).toBe('foo')
    })

    it('stream', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: 'hello',
        headers: {
          'standard-server': 'stream',
        },
      })

      const standardBody = await toStandardBody(request)
      expect(standardBody).toBeInstanceOf(ReadableStream)
      const reader = (standardBody as ReadableStream).pipeThrough(new TextDecoderStream()).getReader()
      expect(await reader.read()).toEqual({ done: false, value: 'hello' })
      expect(await reader.read()).toEqual({ done: true, value: undefined })
    })

    it('stream (empty body)', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: null,
        headers: {
          'standard-server': 'stream',
        },
      })

      const standardBody = await toStandardBody(request)
      expect(standardBody).toBeInstanceOf(ReadableStream)
      const reader = (standardBody as ReadableStream).pipeThrough(new TextDecoderStream()).getReader()
      expect(await reader.read()).toEqual({ done: true, value: undefined })
    })
  })

  describe('edge case', () => {
    it('throw on read body multiple time except (hint=none)', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
        headers: {
          'content-type': 'application/json',
        },
      })

      expect(await toStandardBody(request)).toEqual({ foo: 'bar' })
      await expect(toStandardBody(request)).rejects.toThrow('Failed to read body: body stream already read')
      expect(await toStandardBody(request, { hint: 'none' })).toBe(undefined)
    })

    it('fallback to user defined body hint', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: 'hello',
        headers: {
          'content-length': '567',
        },
      })

      const standardBody = await toStandardBody(request, { hint: 'stream' })
      expect(standardBody).toBeInstanceOf(ReadableStream)
      const reader = (standardBody as ReadableStream).pipeThrough(new TextDecoderStream()).getReader()
      expect(await reader.read()).toEqual({ done: false, value: 'hello' })
      expect(await reader.read()).toEqual({ done: true, value: undefined })
    })

    it('defaults to stream if no hint matches', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: 'raw data',
        headers: {
          'content-type': 'application/octet-stream',
        },
      })

      const standardBody = await toStandardBody(request)
      expect(standardBody).toBeInstanceOf(ReadableStream)
      const reader = (standardBody as ReadableStream).pipeThrough(new TextDecoderStream()).getReader()
      expect(await reader.read()).toEqual({ done: false, value: 'raw data' })
    })

    it('parse as stream if invalid body hint', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: 'raw data',
        headers: {
          'standard-server': 'invalid',
        },
      })

      const standardBody = await toStandardBody(request)
      expect(standardBody).toBeInstanceOf(ReadableStream)
      const reader = (standardBody as ReadableStream).pipeThrough(new TextDecoderStream()).getReader()
      expect(await reader.read()).toEqual({ done: false, value: 'raw data' })
    })
  })
})

describe('toFetchBody', () => {
  const baseHeaders = new Headers({
    'content-type': 'application/json',
    'x-custom-header': 'custom-value',
  })

  it('undefined', () => {
    const base = new Headers(baseHeaders)
    const [body, headers] = toFetchBody(undefined, base, {})

    expect(body).toBe(undefined)
    expect(Object.fromEntries(headers)).toEqual({
      'x-custom-header': 'custom-value',
      'standard-server': 'none',
    })
  })

  it('json', () => {
    const base = new Headers(baseHeaders)
    const [body, headers] = toFetchBody({ foo: 'bar' }, base, {})

    expect(body).toBe('{"foo":"bar"}')
    expect(Object.fromEntries(headers)).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'custom-value',
      'standard-server': 'json',
    })
  })

  it('form-data', () => {
    const base = new Headers(baseHeaders)
    const form = new FormData()
    form.append('foo', 'bar')
    form.append('bar', 'baz')

    const [body, headers] = toFetchBody(form, base, {})

    expect(body).toBe(form)
    expect(Object.fromEntries(headers)).toEqual({
      'x-custom-header': 'custom-value',
      'standard-server': 'form-data',
    })
  })

  it('url-search-params', async () => {
    const base = new Headers(baseHeaders)
    const query = new URLSearchParams('foo=bar&bar=baz')

    const [body, headers] = toFetchBody(query, base, {})

    expect(body).toBe(query)
    expect(Object.fromEntries(headers)).toEqual({
      'x-custom-header': 'custom-value',
      'standard-server': 'url-search-params',
    })
  })

  it('blob', () => {
    const base = new Headers(baseHeaders)
    const blob = new Blob(['foo'], { type: 'application/pdf' })

    generateContentDispositionSpy.mockReturnValue('__mocked__')

    const [body, headers] = toFetchBody(blob, base, {})

    expect(body).toBe(blob)
    expect(Object.fromEntries(headers)).toEqual({
      'content-disposition': '__mocked__',
      'content-length': '3',
      'content-type': 'application/pdf',
      'x-custom-header': 'custom-value',
      'standard-server': 'file',
    })

    expect(generateContentDispositionSpy).toHaveBeenCalledTimes(1)
    expect(generateContentDispositionSpy).toHaveBeenCalledWith('blob')
  })

  it('file', () => {
    const base = new Headers(baseHeaders)
    const blob = new File(['foo'], 'foo.pdf', { type: 'application/pdf' })

    generateContentDispositionSpy.mockReturnValue('__mocked__')

    const [body, headers] = toFetchBody(blob, base, {})

    expect(body).toBe(blob)
    expect(Object.fromEntries(headers)).toEqual({
      'content-disposition': '__mocked__',
      'content-length': '3',
      'content-type': 'application/pdf',
      'x-custom-header': 'custom-value',
      'standard-server': 'file',
    })

    expect(generateContentDispositionSpy).toHaveBeenCalledTimes(1)
    expect(generateContentDispositionSpy).toHaveBeenCalledWith('foo.pdf')
  })

  it('file with content-disposition', () => {
    const base = new Headers(baseHeaders)
    base.set('content-disposition', 'attachment; filename="foo.pdf"')
    const blob = new File(['foo'], 'foo.pdf', { type: 'application/pdf' })

    getFilenameFromContentDispositionSpy.mockReturnValue('foo.pdf')

    const [body, headers] = toFetchBody(blob, base, {})

    expect(body).toBe(blob)
    expect(Object.fromEntries(headers)).toEqual({
      'content-disposition': 'attachment; filename="foo.pdf"',
      'content-length': '3',
      'content-type': 'application/pdf',
      'x-custom-header': 'custom-value',
      'standard-server': 'file',
    })

    expect(generateContentDispositionSpy).toHaveBeenCalledTimes(0)
  })

  it('file with invalid content-disposition', () => {
    const base = new Headers(baseHeaders)
    base.set('content-disposition', 'attachment;') // Missing filename
    const blob = new File(['foo'], 'foo.pdf', { type: 'application/pdf' })

    getFilenameFromContentDispositionSpy.mockReturnValue(undefined)
    generateContentDispositionSpy.mockReturnValue('content-disposition-generated')

    const [body, headers] = toFetchBody(blob, base, {})

    expect(body).toBe(blob)
    // Should imply it generated a new content-disposition because the existing one failed to Parse filename
    expect(generateContentDispositionSpy).toHaveBeenCalledWith('foo.pdf')
    expect(headers.get('content-disposition')).toBe('content-disposition-generated')
  })

  it('file with size=nan', () => {
    // BunS3 is a File instance but has an unknown size (NaN), so to support it we should return a stream in this case.
    const base = new Headers(baseHeaders)
    const file = new File(['foo'], 'foo.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', { value: Number.NaN })

    generateContentDispositionSpy.mockReturnValue('__mocked__')
    const [body, headers] = toFetchBody(file, base, {})

    expect(body).toBeInstanceOf(ReadableStream)
    expect(Object.fromEntries(headers)).toEqual({
      'content-disposition': '__mocked__',
      'content-type': 'application/pdf',
      'x-custom-header': 'custom-value',
      'standard-server': 'file',
    })
  })

  it('async generator', async () => {
    async function* gen() {
      yield 123
      return 456
    }
    const options = { eventIterator: { keepAliveEnabled: false } }
    const base = new Headers(baseHeaders)
    const [body, headers] = toFetchBody(gen(), base, options)

    expect(toEventStreamSpy).toHaveBeenCalledWith(gen(), options.eventIterator)

    expect(body).toBeInstanceOf(ReadableStream)
    expect(Object.fromEntries(headers)).toEqual({
      'content-type': 'text/event-stream',
      'x-custom-header': 'custom-value',
      'standard-server': 'event-stream',
    })

    const reader = (body as ReadableStream).pipeThrough(new TextDecoderStream()).getReader()

    expect(await reader.read()).toEqual({ done: false, value: ': \n\n' })
    expect(await reader.read()).toEqual({ done: false, value: 'event: message\ndata: 123\n\n' })
    expect(await reader.read()).toEqual({ done: false, value: 'event: close\ndata: 456\n\n' })
  })

  it('stream', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      },
    })
    const base = new Headers(baseHeaders)
    const [body, headers] = toFetchBody(stream, base, {})

    expect(body).toBe(stream)
    expect(Object.fromEntries(headers)).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'custom-value',
      'standard-server': 'stream',
    })
  })
})
