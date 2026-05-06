import { getEventIteratorEventMeta, unwrapEventIteratorEvent, withEventIteratorEventMeta } from './meta'

it('get/withEventIteratorEventMeta', () => {
  const data = { value: 123, meta: undefined }
  const applied = withEventIteratorEventMeta(data, { id: '123', retry: 10000, comments: ['hello', 'world'] })
  expect(applied).toEqual(data)
  expect(applied).not.toBe(data)
  expect(getEventIteratorEventMeta(applied)).toEqual({ id: '123', retry: 10000, comments: ['hello', 'world'] })
  expect(getEventIteratorEventMeta(data)).toEqual(undefined)
  expect(getEventIteratorEventMeta(1)).toEqual(undefined)

  expect(() => withEventIteratorEventMeta(data, { id: '123\n' })).toThrow('Event\'s id must not contain a carriage return or newline character')
  expect(() => withEventIteratorEventMeta(data, { id: '123\r' })).toThrow('Event\'s id must not contain a carriage return or newline character')
  expect(() => withEventIteratorEventMeta(data, { retry: Number.NaN })).toThrow('Event\'s retry must be a integer and >= 0')
  expect(() => withEventIteratorEventMeta(data, { retry: 1.1 })).toThrow('Event\'s retry must be a integer and >= 0')
  expect(() => withEventIteratorEventMeta(data, { retry: -1 })).toThrow('Event\'s retry must be a integer and >= 0')
  expect(() => withEventIteratorEventMeta(data, { comments: ['hi\n'] })).toThrow('Event\'s comment must not contain a carriage return or newline character')
  expect(() => withEventIteratorEventMeta(data, { comments: ['hi\r'] })).toThrow('Event\'s comment must not contain a carriage return or newline character')
})

it('withEventIteratorEventMeta only proxy when make sense', () => {
  const data = { value: 123, meta: undefined }

  expect(withEventIteratorEventMeta(data, { id: '123', retry: 10000, comments: ['hello', 'world'] })).not.toBe(data)
  expect(withEventIteratorEventMeta(data, { id: '' })).not.toBe(data)
  expect(withEventIteratorEventMeta(data, { retry: 0 })).not.toBe(data)
  expect(withEventIteratorEventMeta(data, { comments: [''] })).not.toBe(data)
  expect(withEventIteratorEventMeta(data, { comments: [] })).not.toBe(data)

  expect(withEventIteratorEventMeta(data, {})).toBe(data)
  expect(withEventIteratorEventMeta(data, { notExists: true } as any)).toBe(data)
  expect(withEventIteratorEventMeta(data, { id: undefined })).toBe(data)
})

it('getEventIteratorEventMeta remove unknown meta', () => {
  const data = { value: 123, meta: undefined }
  const meta = { id: '123', unknown: 'value1' }
  const applied = withEventIteratorEventMeta(data, meta)
  expect(getEventIteratorEventMeta(applied)).toEqual({ id: '123' })
})

describe('unwrapEventIteratorEvent', () => {
  it('non-object', () => {
    expect(unwrapEventIteratorEvent(1)).toEqual([1, undefined])
    expect(unwrapEventIteratorEvent('1')).toEqual(['1', undefined])
    expect(unwrapEventIteratorEvent(true)).toEqual([true, undefined])
    expect(unwrapEventIteratorEvent(null)).toEqual([null, undefined])
    expect(unwrapEventIteratorEvent(undefined)).toEqual([undefined, undefined])
  })

  it('object without events', () => {
    const data = { value: 123, meta: undefined }
    const [resolvedData, resolvedMeta] = unwrapEventIteratorEvent(data)
    expect(resolvedData).toBe(data)
    expect(resolvedMeta).toBe(undefined)
  })

  it('object with events', () => {
    const data = { value: 123, meta: undefined }
    const meta = { id: '123' }
    const applied = withEventIteratorEventMeta(data, meta)
    const [resolvedData, resolvedMeta] = unwrapEventIteratorEvent(applied)
    expect(resolvedData).toBe(data)
    expect(resolvedMeta).toEqual(meta)
  })
})
