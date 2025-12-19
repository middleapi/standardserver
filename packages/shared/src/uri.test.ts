import { tryDecodeURIComponent } from './uri'

it('tryDecodeURIComponent', () => {
  expect(tryDecodeURIComponent('test')).toBe('test')
  expect(tryDecodeURIComponent('test%20value')).toBe('test value')
  expect(tryDecodeURIComponent('invalid%20value%')).toBe('invalid%20value%')
  expect(tryDecodeURIComponent('%E0%A4%A')).toBe('%E0%A4%A') // Invalid UTF-8 sequence
  expect(tryDecodeURIComponent('')).toBe('')
})
