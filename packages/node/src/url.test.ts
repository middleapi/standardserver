import { toStandardUrl } from './url'

describe('toStandardUrl', () => {
  it('works', () => {
    const standardUrl = toStandardUrl({
      url: '/hello?foo=bar#baz',
    } as any)

    expect(standardUrl.pathname).toEqual('/hello')
    expect(standardUrl.query?.get('foo')).toEqual('bar')
    expect(standardUrl.hash).toEqual('#baz')
  })

  it('prefer originalUrl', () => {
    const standardUrl = toStandardUrl({
      url: '/hello1?foo=bar',
      originalUrl: '/hello2?foo=bar&baz=qux',
    } as any)

    expect(standardUrl.pathname).toEqual('/hello2')
    expect(standardUrl.query?.get('foo')).toEqual('bar')
    expect(standardUrl.query?.get('baz')).toEqual('qux')
    expect(standardUrl.hash).toBeUndefined()
  })

  it('malformed url', () => {
    expect(toStandardUrl({ url: '////' } as any).pathname).toEqual('////')
    expect(toStandardUrl({ url: ':::' } as any).pathname).toEqual('/:::')
    expect(toStandardUrl({ url: undefined } as any).pathname).toEqual('/')
  })
})
