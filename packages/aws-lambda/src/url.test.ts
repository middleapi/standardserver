import { toStandardUrl } from './url'

describe('toStandardUrl (v2)', () => {
  it('works without query string', () => {
    expect(toStandardUrl({
      rawPath: '/example',
      requestContext: { http: { method: 'GET' } },
    })).toBe('/example')

    expect(toStandardUrl({
      rawPath: '/example',
      rawQueryString: '',
      requestContext: { http: { method: 'GET' } },
    })).toBe('/example')
  })

  it('adds a leading slash when missing', () => {
    expect(toStandardUrl({
      rawPath: 'example',
      requestContext: { http: { method: 'GET' } },
    })).toBe('/example')
  })

  it('uses rawQueryString as-is', () => {
    expect(toStandardUrl({
      rawPath: '/example',
      rawQueryString: 'foo=bar&foo=baz&a+key=a+value%26%3D%23',
      requestContext: { http: { method: 'GET' } },
    })).toBe('/example?foo=bar&foo=baz&a+key=a+value%26%3D%23')
  })
})

describe('toStandardUrl (v1)', () => {
  it('works without query string', () => {
    expect(toStandardUrl({ httpMethod: 'GET', path: '/example' })).toBe('/example')
  })

  it('detects v1 by the top-level httpMethod field', () => {
    // a v1 event carries a requestContext too, it must not be mistaken for v2
    expect(toStandardUrl({
      httpMethod: 'GET',
      path: '/example',
      requestContext: {},
      queryStringParameters: { foo: 'bar' },
    } as any)).toBe('/example?foo=bar')
  })

  it('adds a leading slash when missing', () => {
    expect(toStandardUrl({ httpMethod: 'GET', path: 'example' })).toBe('/example')
  })

  it('merges both sources, preferring multiValueQueryStringParameters per key', () => {
    expect(toStandardUrl({
      httpMethod: 'GET',
      path: '/example',
      queryStringParameters: { foo: 'ignored', only: 'kept' },
      multiValueQueryStringParameters: { foo: ['bar', 'baz'], hello: ['world'] },
    })).toBe('/example?foo=bar&foo=baz&hello=world&only=kept')
  })

  it('skips undefined multiValueQueryStringParameters values', () => {
    expect(toStandardUrl({
      httpMethod: 'GET',
      path: '/example',
      multiValueQueryStringParameters: { foo: ['bar'], skipped: undefined },
    })).toBe('/example?foo=bar')
  })

  it('falls back to queryStringParameters', () => {
    expect(toStandardUrl({
      httpMethod: 'GET',
      path: '/example',
      queryStringParameters: { foo: 'bar', empty: '', skipped: undefined },
      multiValueQueryStringParameters: null,
    })).toBe('/example?foo=bar&empty=')
  })

  it('re-encodes decoded query string parameters', () => {
    expect(toStandardUrl({
      httpMethod: 'GET',
      path: '/example',
      multiValueQueryStringParameters: { 'a key': ['a value&=#'] },
    })).toBe(`/example?${new URLSearchParams({ 'a key': 'a value&=#' })}`)
  })

  it('ignores empty query containers', () => {
    expect(toStandardUrl({
      httpMethod: 'GET',
      path: '/example',
      queryStringParameters: null,
      multiValueQueryStringParameters: {},
    })).toBe('/example')
  })
})
