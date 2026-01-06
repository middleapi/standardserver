import { UNBOUND_ORIGIN } from '@standardserver/core'
import { describe, expect, it } from 'vitest'
import { toStandardUrl } from './url'

describe('toStandardUrl', () => {
  it('parses url with pathname, query, and hash', () => {
    const url = toStandardUrl({ url: '/hello?foo=bar#baz', headers: { host: 'localhost' }, socket: {} } as any)

    expect(url.pathname).toEqual('/hello')
    expect(url.searchParams.get('foo')).toEqual('bar')
    expect(url.hash).toEqual('#baz')
  })

  it('prefers originalUrl over url', () => {
    const url = toStandardUrl({ url: '/a', originalUrl: '/b?x=1', headers: { host: 'localhost' }, socket: {} } as any)

    expect(url.pathname).toEqual('/b')
    expect(url.searchParams.get('x')).toEqual('1')
  })

  it('handles malformed paths gracefully', () => {
    expect(toStandardUrl({ url: '////', headers: {} } as any).pathname).toEqual('////')
    expect(toStandardUrl({ url: ':::', headers: {} } as any).pathname).toEqual('/:::')
    expect(toStandardUrl({ url: undefined, headers: {} } as any).pathname).toEqual('/')
  })

  it('uses explicit origin option', () => {
    const url = toStandardUrl({ url: '/foo' } as any, { origin: 'https://example.com' })

    expect(url.origin).toEqual('https://example.com')
  })

  it('infers http origin from host header', () => {
    const url = toStandardUrl({ url: '/foo', headers: { host: 'api.example.com' }, socket: {} } as any)

    expect(url.origin).toEqual('http://api.example.com')
  })

  it('infers https origin when socket is encrypted', () => {
    const url = toStandardUrl({ url: '/foo', headers: { host: 'api.example.com' }, socket: { encrypted: true } } as any)

    expect(url.origin).toEqual('https://api.example.com')
  })

  it('fallbacks to UNBOUND_ORIGIN when host is missing or invalid', () => {
    expect(toStandardUrl({ url: '/foo', headers: {} } as any).origin).toEqual(UNBOUND_ORIGIN)
    expect(toStandardUrl({ url: '/foo', headers: { host: '///' } } as any).origin).toEqual(UNBOUND_ORIGIN)
  })
})
