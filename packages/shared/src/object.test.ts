import { isTypescriptObject, omit } from './object'

it('isTypescriptObject', () => {
  expect(isTypescriptObject(null)).toBe(false)
  expect(isTypescriptObject(undefined)).toBe(false)
  expect(isTypescriptObject(123)).toBe(false)
  expect(isTypescriptObject('string')).toBe(false)

  expect(isTypescriptObject({})).toBe(true)
  expect(isTypescriptObject(new Date())).toBe(true)
  expect(isTypescriptObject(() => {})).toBe(true)
})

describe('omit', () => {
  const obj = { a: 1, b: 2, c: 3 }

  it('omits a single key', () => {
    expect(omit(obj, ['a'])).toEqual({ b: 2, c: 3 })
  })

  it('omits multiple keys', () => {
    expect(omit(obj, ['a', 'b'])).toEqual({ c: 3 })
  })

  it('omits no keys', () => {
    expect(omit(obj, [])).toEqual(obj)
  })

  it('ignores non-existent keys', () => {
    expect(omit(obj, ['z' as any])).toEqual(obj)
  })

  it('does not mutate the original', () => {
    omit(obj, ['a'])
    expect(obj).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('handles symbol keys', () => {
    const sym = Symbol('x')
    const o = { [sym]: 42, a: 1 }
    expect(omit(o, [sym])).toEqual({ a: 1 })
  })
})
