import { isTypescriptObject } from './object'

it('isTypescriptObject', () => {
  expect(isTypescriptObject(null)).toBe(false)
  expect(isTypescriptObject(undefined)).toBe(false)
  expect(isTypescriptObject(123)).toBe(false)
  expect(isTypescriptObject('string')).toBe(false)

  expect(isTypescriptObject({})).toBe(true)
  expect(isTypescriptObject(new Date())).toBe(true)
  expect(isTypescriptObject(() => {})).toBe(true)
})
