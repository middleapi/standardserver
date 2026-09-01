import { toStandardUrl } from './url'

it('toStandardUrl', () => {
  expect(toStandardUrl({ } as any)).toBe('/')
  expect(toStandardUrl({ url: '/foo' } as any)).toBe('/foo')
  expect(toStandardUrl({ url: '/foo?bar=1#baz' } as any)).toBe('/foo?bar=1#baz')
  expect(toStandardUrl({ url: '/', originalUrl: '/foo?bar=2#baz' } as any)).toBe('/foo?bar=2#baz')
  expect(toStandardUrl({ url: 'base' } as any)).toBe('/base')
  expect(toStandardUrl({ url: 'http://127.0.0.1:3000/ping' } as any)).toBe('/ping')
  expect(toStandardUrl({ url: 'http://example.com/foo?bar=1' } as any)).toBe('/foo?bar=1')
  expect(toStandardUrl({ url: 'https://example.com/foo#h' } as any)).toBe('/foo#h')
  expect(toStandardUrl({ url: 'HTTP://EXAMPLE.COM/Foo' } as any)).toBe('/Foo')
  expect(toStandardUrl({ url: '/', originalUrl: 'http://127.0.0.1:80/foo?x=1' } as any)).toBe('/foo?x=1')
})
