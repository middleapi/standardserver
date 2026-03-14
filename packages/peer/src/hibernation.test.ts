import { isAsyncIteratorObject } from '@standardserver/shared'
import { HibernationEventIterator } from './hibernation'

describe('hibernationEventIterator', () => {
  it('is async iterator object', () => {
    const iterator = new HibernationEventIterator(vi.fn())
    expect(iterator).toSatisfy(isAsyncIteratorObject)
  })

  it('next() throws', async () => {
    const iterator = new HibernationEventIterator(vi.fn())
    await expect(iterator.next()).rejects.toThrowError('Cannot use hibernating iterator directly')
  })

  it('return() throws', async () => {
    const iterator = new HibernationEventIterator(vi.fn())
    await expect(iterator.return()).rejects.toThrowError('Cannot use hibernating iterator directly')
  })

  it('invokes callback with correct id', () => {
    const callback = vi.fn()
    const iterator = new HibernationEventIterator(callback)

    iterator.hibernationCallback?.('12344')

    expect(callback).toHaveBeenCalledWith('12344')
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
