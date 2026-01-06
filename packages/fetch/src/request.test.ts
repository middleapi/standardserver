import type { StandardRequest } from '@standardserver/core'
import * as Core from '@standardserver/core'
import * as Body from './body'
import * as Headers from './headers'
import { toFetchRequest, toStandardLazyRequest } from './request'

const toStandardBodySpy = vi.spyOn(Body, 'toStandardBody')
const toFetchBodySpy = vi.spyOn(Body, 'toFetchBody')
const toStandardHeadersSpy = vi.spyOn(Headers, 'toStandardHeaders')
const toFetchHeadersSpy = vi.spyOn(Headers, 'toFetchHeaders')
const stringToUrlSpy = vi.spyOn(Core, 'stringToUrl')
const urlToStringSpy = vi.spyOn(Core, 'urlToString')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('toStandardLazyRequest', () => {
  it('works', () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' }),
      headers: {
        'content-type': 'application/json',
      },
    })

    const standardRequest = toStandardLazyRequest(request)

    expect(standardRequest).toEqual(expect.objectContaining(stringToUrlSpy.mock.results[0]!.value))
    expect(standardRequest.method).toBe('POST')
    expect(standardRequest.signal).toBe(request.signal)
    expect(standardRequest.headers).toEqual(toStandardHeadersSpy.mock.results[0]!.value)
    expect(standardRequest.body('json')).toBe(toStandardBodySpy.mock.results[0]!.value)

    expect(stringToUrlSpy).toBeCalledTimes(1)
    expect(stringToUrlSpy).toBeCalledWith(request.url)

    expect(toStandardHeadersSpy).toBeCalledTimes(1)
    expect(toStandardHeadersSpy).toBeCalledWith(request.headers)

    expect(toStandardBodySpy).toBeCalledTimes(1)
    expect(toStandardBodySpy).toBeCalledWith(request, { hint: 'json' })
  })

  it('headers is lazy and can override', async () => {
    const response = new Request('https://example.com', {
      headers: {
        'x-custom-header': 'custom-value',
      },
    })

    const lazyResponse = toStandardLazyRequest(response)

    expect(toStandardHeadersSpy).toBeCalledTimes(0)
    lazyResponse.headers = { overrided: '1' }
    expect(lazyResponse.headers).toEqual({ overrided: '1' }) // can override before access
    expect(toStandardHeadersSpy).toBeCalledTimes(0)

    const lazyResponse2 = toStandardLazyRequest(response)
    expect(lazyResponse2.headers).toEqual(toStandardHeadersSpy.mock.results[0]!.value)
    expect(lazyResponse2.headers).toEqual(toStandardHeadersSpy.mock.results[0]!.value) // ensure cached
    expect(toStandardHeadersSpy).toBeCalledTimes(1)

    lazyResponse2.headers = { overrided: '2' }
    expect(lazyResponse2.headers).toEqual({ overrided: '2' }) // can override after access
  })
})

describe('toFetchRequest', () => {
  it('works', async () => {
    const controller = new AbortController()

    const standardRequest: StandardRequest = {
      url: new URL('https://example.com'),
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-foo': 'bar',
      },
      body: { foo: 'bar' },
    }

    const options = { body: { eventIterator: { keepAliveComment: 'test' } } }
    const fetchRequest = toFetchRequest(standardRequest, options)
    expect(fetchRequest.url).toEqual(urlToStringSpy.mock.results[0]!.value)
    expect(fetchRequest.method).toEqual(standardRequest.method)
    expect(fetchRequest.headers).toEqual(toFetchBodySpy.mock.results[0]!.value[1])

    expect(urlToStringSpy).toHaveBeenCalledTimes(1)
    expect(urlToStringSpy).toHaveBeenCalledWith(standardRequest.url)

    expect(toFetchHeadersSpy).toHaveBeenCalledTimes(1)
    expect(toFetchHeadersSpy).toHaveBeenCalledWith(standardRequest.headers)

    expect(toFetchBodySpy).toHaveBeenCalledTimes(1)
    expect(toFetchBodySpy).toHaveBeenCalledWith(standardRequest.body, toFetchHeadersSpy.mock.results[0]!.value, options.body)

    await expect(fetchRequest.json()).resolves.toEqual(standardRequest.body)

    const fetchSignal = fetchRequest.signal

    expect(fetchSignal.aborted).toBe(false)
    controller.abort()
    expect(fetchSignal.aborted).toBe(true)
  })

  it('with empty body', async () => {
    const standardRequest: StandardRequest = {
      url: new URL('https://example.com'),
      method: 'POST',
      headers: {},
      body: undefined,
    }

    const fetchRequest = toFetchRequest(standardRequest)
    expect(fetchRequest.body).toBeNull()
  })
})
