import { getPackageSymbol } from './consts'

it('getPackageSymbol return consistent results', () => {
  expect(getPackageSymbol('a')).toBe(getPackageSymbol('a'))
  expect(getPackageSymbol('b')).toBe(getPackageSymbol('b'))
  expect(getPackageSymbol('diff')).not.toBe(getPackageSymbol('b'))
})
