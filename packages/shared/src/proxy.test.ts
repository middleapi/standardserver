import { expect, it } from 'vitest'
import { getOrBind } from './proxy'

it('getOrBind', () => {
  const target = {
    foo: 'bar',
    getFoo() {
      return this.foo
    },
  }

  // get
  expect(getOrBind(target, 'foo')).toBe(target.foo)
  expect(getOrBind(target, 'getFoo')).not.toBe(target.getFoo)

  // bind
  expect(getOrBind(target, 'getFoo')()).toBe(target.getFoo())

  // cache
  expect(getOrBind(target, 'getFoo')).toBe(getOrBind(target, 'getFoo'))
})
