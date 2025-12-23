import type { StandardRequest } from '@standardserver/core'
import * as Body from './body'
import * as Headers from './headers'
import { toFetchRequest, toStandardLazyRequest } from './request'
import * as Url from './url'

const toStandardBodySpy = vi.spyOn(Body, 'toStandardBody')
const toFetchBodySpy = vi.spyOn(Body, 'toFetchBody')
const toStandardHeadersSpy = vi.spyOn(Headers, 'toStandardHeaders')
const toFetchHeadersSpy = vi.spyOn(Headers, 'toFetchHeaders')
const toStandardUrlSpy = vi.spyOn(Url, 'toStandardUrl')
const toFetchUrlSpy = vi.spyOn(Url, 'toFetchUrl')

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

    const standardRequest = toStandardLazyRequest(request, { body: { hint: 'json' } })

    expect(standardRequest).toEqual(expect.objectContaining(toStandardUrlSpy.mock.results[0]!.value))
    expect(standardRequest.method).toBe('POST')
    expect(standardRequest.signal).toBe(request.signal)
    expect(standardRequest.headers).toEqual(toStandardHeadersSpy.mock.results[0]!.value)
    expect(standardRequest.body()).toBe(toStandardBodySpy.mock.results[0]!.value)

    expect(toStandardUrlSpy).toBeCalledTimes(1)
    expect(toStandardUrlSpy).toBeCalledWith(new URL(request.url))

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
      origin: 'https://example.com',
      pathname: '/path/to/resource',
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-foo': 'bar',
      },
      body: { foo: 'bar' },
    }

    const options = { body: { eventIterator: { keepAliveComment: 'test' } } }
    const fetchRequest = toFetchRequest(standardRequest, options)
    expect(fetchRequest.url).toEqual(toFetchUrlSpy.mock.results[0]!.value)
    expect(fetchRequest.method).toEqual(standardRequest.method)
    expect(fetchRequest.headers).toEqual(toFetchBodySpy.mock.results[0]!.value[1])

    expect(toFetchUrlSpy).toHaveBeenCalledTimes(1)
    expect(toFetchUrlSpy).toHaveBeenCalledWith(standardRequest)

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
      origin: 'https://example.com',
      pathname: '/path/to/resource',
      method: 'POST',
      headers: {},
      body: undefined,
    }

    const fetchRequest = toFetchRequest(standardRequest)
    expect(fetchRequest.body).toBeNull()
  })
})
