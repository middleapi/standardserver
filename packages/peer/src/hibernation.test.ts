import { HibernationEventIterator } from './hibernation'

it('hibernationEventIterator', async () => {
  const callback = vi.fn()

  const iterator1 = new HibernationEventIterator(callback)
  await expect(iterator1.next()).rejects.toThrowError('Cannot use hibernating iterator directly')
  const iterator2 = new HibernationEventIterator(callback)
  await expect(iterator2.return()).rejects.toThrowError('Cannot use hibernating iterator directly')

  iterator1.hibernationCallback?.('12344')

  expect(callback).toBeCalledWith('12344')
  expect(callback).toBeCalledTimes(1)
})
