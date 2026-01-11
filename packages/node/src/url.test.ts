import { toStandardUrl } from './url'

it('toStandardUrl', () => {
  expect(toStandardUrl({ } as any)).toBe('/')
  expect(toStandardUrl({ url: '/foo' } as any)).toBe('/foo')
  expect(toStandardUrl({ url: '/foo?bar=1#baz' } as any)).toBe('/foo?bar=1#baz')
  expect(toStandardUrl({ url: '/', originalUrl: '/foo?bar=2#baz' } as any)).toBe('/foo?bar=2#baz')
})
