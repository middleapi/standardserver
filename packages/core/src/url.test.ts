import { stringToUrl, urlToString } from './url'

describe('stringToUrl', () => {
  it('relative urls', () => {
    expect(stringToUrl('/').href).toEqual('http://unbound.invalid/')
    expect(stringToUrl('/hello').href).toEqual('http://unbound.invalid/hello')
  })

  it('absolute urls', () => {
    expect(stringToUrl('http://unbound.invalid/').href).toEqual('http://unbound.invalid/')
    expect(stringToUrl('http://unbound.invalid/hello').href).toEqual('http://unbound.invalid/hello')
    expect(stringToUrl('http://localhost:8080/hello').href).toEqual('http://localhost:8080/hello')
    expect(stringToUrl('https://orpc.dev/greet').href).toEqual('https://orpc.dev/greet')
    expect(stringToUrl('https://orpc.dev/greet?name=world#hello').href).toEqual('https://orpc.dev/greet?name=world#hello')
  })

  it('malformed relative urls', () => {
    expect(stringToUrl('///').href).toEqual('http://unbound.invalid///')
    expect(stringToUrl('////').href).toEqual('http://unbound.invalid////')
    expect(stringToUrl(':::').href).toEqual('http://unbound.invalid/:::')
    expect(stringToUrl('::::').href).toEqual('http://unbound.invalid/::::')
  })
})

describe('urlToString', () => {
  it('relative urls', () => {
    expect(urlToString(new URL('http://unbound.invalid'))).toEqual('/')
    expect(urlToString(new URL('http://unbound.invalid///'))).toEqual('///')
    expect(urlToString(new URL('http://unbound.invalid/hello'))).toEqual('/hello')
  })

  it('absolute urls', () => {
    expect(urlToString(new URL('http://unbound.invalid2'))).toEqual('http://unbound.invalid2/')
    expect(urlToString(new URL('http://username:password@unbound.invalid'))).toEqual('http://username:password@unbound.invalid/')
    expect(urlToString(new URL('http://localhost:8080/hello'))).toEqual('http://localhost:8080/hello')
    expect(urlToString(new URL('https://orpc.dev/greet'))).toEqual('https://orpc.dev/greet')
    expect(urlToString(new URL('https://orpc.dev/greet?name=world#hello'))).toEqual('https://orpc.dev/greet?name=world#hello')
  })
})
