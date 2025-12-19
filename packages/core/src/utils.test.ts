import { flattenStandardHeader, generateContentDisposition, getFilenameFromContentDisposition, mergeStandardHeaders } from './utils'

beforeEach(() => {
  vi.clearAllMocks()
})

it('generateContentDisposition', () => {
  expect(generateContentDisposition('')).toEqual('inline; filename=""; filename*=utf-8\'\'')
  expect(generateContentDisposition('test.txt')).toEqual('inline; filename="test.txt"; filename*=utf-8\'\'test.txt')
  expect(generateContentDisposition('!@#$%^%^&*()\'".txt')).toEqual('inline; filename="!@#$%^%^&*()\'\\".txt"; filename*=utf-8\'\'!%40%23%24%25^%25^%26%2A%28%29%27%22.txt')
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

it('mergeStandardHeaders', () => {
  expect(mergeStandardHeaders({ a: '1' }, { a: '2' })).toEqual({ a: ['1', '2'] })
  expect(mergeStandardHeaders({ a: ['1'] }, { a: '2' })).toEqual({ a: ['1', '2'] })
  expect(mergeStandardHeaders({ a: ['1', '2'] }, { a: '3' })).toEqual({ a: ['1', '2', '3'] })
  expect(mergeStandardHeaders({ a: ['1', '2'] }, { a: ['3'] })).toEqual({ a: ['1', '2', '3'] })
  expect(mergeStandardHeaders({ a: ['1', '2'] }, { a: ['3', '4'] })).toEqual({ a: ['1', '2', '3', '4'] })

  expect(mergeStandardHeaders({ a: '1' }, { b: '2' })).toEqual({ a: '1', b: '2' })
  expect(mergeStandardHeaders({ a: '1', b: undefined }, { b: '2' })).toEqual({ a: '1', b: '2' })
  expect(mergeStandardHeaders({ a: '1' }, { a: undefined, b: '2' })).toEqual({ a: '1', b: '2' })
})

it('flattenStandardHeader', () => {
  expect(flattenStandardHeader(['a', 'b'])).toEqual('a, b')
  expect(flattenStandardHeader([])).toEqual(undefined)
  expect(flattenStandardHeader('a')).toEqual('a')
  expect(flattenStandardHeader(undefined)).toEqual(undefined)
})
