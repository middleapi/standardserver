import { toFetchUrl, toStandardUrl } from './url'

describe('toStandardUrl', () => {
  it('converts a full URL to a StandardUrl', () => {
    const url = new URL('https://example.com/path/to/resource?foo=bar#section')
    const standardUrl = toStandardUrl(url)

    expect(standardUrl).toEqual({
      origin: 'https://example.com',
      pathname: '/path/to/resource',
      query: url.searchParams,
      hash: '#section',
    })
  })

  it('handles URL without hash', () => {
    const url = new URL('https://example.com/path?foo=bar')
    const standardUrl = toStandardUrl(url)

    expect(standardUrl).toEqual({
      origin: 'https://example.com',
      pathname: '/path',
      query: url.searchParams,
      hash: undefined,
    })
  })

  it('handles URL without query', () => {
    const url = new URL('https://example.com/path#section')
    const standardUrl = toStandardUrl(url)

    expect(standardUrl).toEqual({
      origin: 'https://example.com',
      pathname: '/path',
      query: url.searchParams,
      hash: '#section',
    })
  })

  it('ensures pathname starts with /', () => {
    // URL object always ensures pathname starts with /, but we can test typical cases
    const url = new URL('https://example.com')
    const standardUrl = toStandardUrl(url)
    expect(standardUrl.pathname).toBe('/')
  })

  it('handles URL with username and password', () => {
    const url = new URL('https://user:pass@example.com/path')
    const standardUrl = toStandardUrl(url)
    expect(standardUrl).toEqual({
      origin: 'https://example.com',
      pathname: '/path',
      query: url.searchParams,
      hash: undefined,
      username: 'user',
      password: 'pass',
    })
  })
})

describe('toFetchUrl', () => {
  it('converts a full StandardUrl to a string', () => {
    const standardUrl = {
      origin: 'https://example.com',
      pathname: '/path/to/resource' as const,
      query: new URLSearchParams('foo=bar'),
      hash: '#section' as const,
    }
    expect(toFetchUrl(standardUrl)).toBe('https://example.com/path/to/resource?foo=bar#section')
  })

  it('handles query parameters without other components', () => {
    const standardUrl = {
      pathname: '/path' as const,
      query: new URLSearchParams('foo=bar&baz=qux'),
    }
    expect(toFetchUrl(standardUrl)).toBe('/path?foo=bar&baz=qux')
  })

  it('handles StandardUrl without origin', () => {
    const standardUrl = {
      pathname: '/path/to/resource' as const,
      query: new URLSearchParams('foo=bar'),
      hash: '#section' as const,
    }
    expect(toFetchUrl(standardUrl)).toBe('/path/to/resource?foo=bar#section')
  })

  it('handles StandardUrl without hash', () => {
    const standardUrl = {
      origin: 'https://example.com',
      pathname: '/path' as const,
    }
    expect(toFetchUrl(standardUrl)).toBe('https://example.com/path')
  })

  it('handles StandardUrl without origin and hash', () => {
    const standardUrl = {
      pathname: '/path' as const,
    }
    expect(toFetchUrl(standardUrl)).toBe('/path')
  })

  it('handles query parameters with special characters', () => {
    const standardUrl = {
      pathname: '/path' as const,
      query: new URLSearchParams('/foo=bar&baz=qux/'),
    }

    expect(toFetchUrl(standardUrl)).toBe('/path?%2Ffoo=bar&baz=qux%2F')
  })
})
