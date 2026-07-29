import { flattenStandardHeader, generateContentDisposition, getFilenameFromContentDisposition, mergeStandardHeaders, parseStandardUrl } from './utils'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateContentDisposition', () => {
  it('handle normal filename', () => {
    expect(generateContentDisposition('test.txt')).toEqual('inline; filename="test.txt"; filename*=utf-8\'\'test.txt')
  })

  it('handle empty filename', () => {
    expect(generateContentDisposition('')).toEqual('inline; filename=""; filename*=utf-8\'\'')
  })

  it('escape " special char', () => {
    expect(generateContentDisposition('!@#$%^%^&*()\'".txt')).toEqual('inline; filename="!@#$%^%^&*()\'\\".txt"; filename*=utf-8\'\'!%40%23%24%25^%25^%26%2A%28%29%27%22.txt')
  })

  it('escape non-ASCII filenames', () => {
    expect(generateContentDisposition('テンプレ\'"ート.txt')).toEqual('inline; filename="____\'\\"__.txt"; filename*=utf-8\'\'%E3%83%86%E3%83%B3%E3%83%97%E3%83%AC%27%22%E3%83%BC%E3%83%88.txt')
  })
})

it('getFilenameFromContentDisposition', () => {
  expect(getFilenameFromContentDisposition('attachment; filename=""; filename*=utf-8\'\'')).toEqual('')
  expect(getFilenameFromContentDisposition('attachment; filename="test.txt"; filename*=utf-8\'\'test.txt')).toEqual('test.txt')
  expect(getFilenameFromContentDisposition('attachment; filename="!@#$%^%^&*()\'".txt"; filename*=utf-8\'\'!%40%23%24%25^%25^%26%2A%28%29%27%22.txt')).toEqual('!@#$%^%^&*()\'".txt')

  expect(getFilenameFromContentDisposition('attachment; filename=""')).toEqual('')
  expect(getFilenameFromContentDisposition('attachment; filename="test.txt"')).toEqual('test.txt')
  expect(getFilenameFromContentDisposition('attachment; filename="!@#$%^%^&*()\'\\".txt"')).toEqual('!@#$%^%^&*()\'".txt')

  expect(getFilenameFromContentDisposition('attachment; filename*=utf-8\'\'')).toEqual('')
  expect(getFilenameFromContentDisposition('attachment; filename*=utf-8\'\'test.txt')).toEqual('test.txt')
  expect(getFilenameFromContentDisposition('attachment; filename*=utf-8\'\'!%40%23%24%25^%25^%26%2A%28%29%27%22.txt')).toEqual('!@#$%^%^&*()\'".txt')

  expect(getFilenameFromContentDisposition('inline; filename="hello.txt"')).toEqual('hello.txt')
  expect(getFilenameFromContentDisposition('inline; filename="hello.txt"; size=123')).toEqual('hello.txt')
  expect(getFilenameFromContentDisposition('inline; filename"hello.txt"; size=123')).toEqual(undefined)

  expect(getFilenameFromContentDisposition('inline; filename*=!%40%23%24%25^%25^%26%2A%28%29%27%22.txt; size=123')).toEqual('!@#$%^%^&*()\'".txt')
})

describe('mergeStandardHeaders', () => {
  afterEach(() => {
    expect(({} as any).polluted).toEqual(undefined)
    expect(({} as any).a).toEqual(undefined)
  })

  it('merge duplicated keys', () => {
    expect(mergeStandardHeaders({ a: '1' }, { a: '2' })).toEqual({ a: ['1', '2'] })
    expect(mergeStandardHeaders({ a: ['1'] }, { a: '2' })).toEqual({ a: ['1', '2'] })
    expect(mergeStandardHeaders({ a: ['1', '2'] }, { a: '3' })).toEqual({ a: ['1', '2', '3'] })
    expect(mergeStandardHeaders({ a: ['1', '2'] }, { a: ['3'] })).toEqual({ a: ['1', '2', '3'] })
    expect(mergeStandardHeaders({ a: ['1', '2'] }, { a: ['3', '4'] })).toEqual({ a: ['1', '2', '3', '4'] })
  })

  it('handle distinct and undefined keys', () => {
    expect(mergeStandardHeaders({ a: '1' }, { b: '2' })).toEqual({ a: '1', b: '2' })
    expect(mergeStandardHeaders({ a: '1', b: undefined }, { b: '2' })).toEqual({ a: '1', b: '2' })
    expect(mergeStandardHeaders({ a: '1' }, { a: undefined, b: '2' })).toEqual({ a: '1', b: '2' })

    // an unset marker coming only from b is carried through, like `headers['content-type'] = undefined`
    expect(Object.keys(mergeStandardHeaders({ a: '1' }, { b: undefined }))).toEqual(['a', 'b'])
  })

  it('keep keys of a in position, then keys only in b', () => {
    expect(Object.keys(mergeStandardHeaders({ c: '1', a: '2' }, { b: '3', a: '4' }))).toEqual(['c', 'a', 'b'])
  })

  it('not pollute the prototype through __proto__ in b', () => {
    const b = JSON.parse('{ "__proto__": { "polluted": "yes" } }')

    const merged = mergeStandardHeaders({ a: '1' }, b)

    expect(Object.getPrototypeOf(merged)).toEqual(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(merged, '__proto__')?.value).toEqual({ polluted: 'yes' })
    expect(merged.a).toEqual('1')
  })

  it('not pollute the prototype through __proto__ in both a and b', () => {
    const a = JSON.parse('{ "__proto__": "1" }')
    const b = JSON.parse('{ "__proto__": "2" }')

    const merged = mergeStandardHeaders(a, b)

    expect(Object.getPrototypeOf(merged)).toEqual(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(merged, '__proto__')?.value).toEqual(['1', '2'])
  })
})

it('flattenStandardHeader', () => {
  expect(flattenStandardHeader(['a', 'b'])).toEqual('a, b')
  expect(flattenStandardHeader([])).toEqual(undefined)
  expect(flattenStandardHeader('a')).toEqual('a')
  expect(flattenStandardHeader(undefined)).toEqual(undefined)
})

describe('parseStandardUrl', () => {
  it('should parse pathname only', () => {
    expect(parseStandardUrl('/')).toEqual([
      '/',
      undefined,
      undefined,
    ])

    expect(parseStandardUrl('/users/123/profile')).toEqual([
      '/users/123/profile',
      undefined,
      undefined,
    ])
  })

  it('should parse pathname with search params', () => {
    expect(parseStandardUrl('/search?q=test&page=2')).toEqual([
      '/search',
      '?q=test&page=2',
      undefined,
    ])
  })

  it('should parse pathname with hash', () => {
    expect(parseStandardUrl('/docs#intro')).toEqual([
      '/docs',
      undefined,
      '#intro',
    ])
  })

  it('should parse pathname with search and hash', () => {
    expect(parseStandardUrl('/products?category=electronics#reviews')).toEqual([
      '/products',
      '?category=electronics',
      '#reviews',
    ])
  })

  it('should handle hash before search (hash takes priority)', () => {
    expect(parseStandardUrl('/page#section?query=1')).toEqual([
      '/page',
      undefined,
      '#section?query=1',
    ])
  })

  it('should handle multiple question marks and hashes', () => {
    expect(parseStandardUrl('/page?q=1?extra=2')).toEqual([
      '/page',
      '?q=1?extra=2',
      undefined,
    ])

    expect(parseStandardUrl('/page#hash#another')).toEqual([
      '/page',
      undefined,
      '#hash#another',
    ])

    expect(parseStandardUrl('/page?q=1?x=2#sec#sub')).toEqual([
      '/page',
      '?q=1?x=2',
      '#sec#sub',
    ])

    expect(parseStandardUrl('/page#sec?q=1#sub?x=2')).toEqual([
      '/page',
      undefined,
      '#sec?q=1#sub?x=2',
    ])
  })

  it('should handle empty search and hash markers', () => {
    expect(parseStandardUrl('/page?#')).toEqual([
      '/page',
      '?',
      '#',
    ])
  })
})
