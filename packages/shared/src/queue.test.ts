import { AbortError } from './error'
import { AsyncIdQueue } from './queue'

describe('asyncIdQueue', () => {
  let queue: AsyncIdQueue<string>
  const queueId1 = '1'
  const queueId2 = '2'

  beforeEach(() => {
    queue = new AsyncIdQueue<string>()
  })

  it('should require queue to be opened before push', () => {
    expect(() => queue.push(queueId1, 'item1')).toThrow(
      new Error(`[AsyncIdQueue] Cannot access queue[${queueId1}] because it is not open or aborted.`),
    )
  })

  it('should require queue to be opened before pull', async () => {
    await expect(queue.pull(queueId1)).rejects.toThrow(
      new Error(`[AsyncIdQueue] Cannot access queue[${queueId1}] because it is not open or aborted.`),
    )
  })

  it('should push and pull items in FIFO order', async () => {
    queue.open(queueId1)
    queue.push(queueId1, 'item1')
    queue.push(queueId1, 'item2')

    expect(await queue.pull(queueId1)).toBe('item1')
    expect(await queue.pull(queueId1)).toBe('item2')
  })

  it('should handle pulls before pushes (async wait)', async () => {
    queue.open(queueId1)
    const pullPromise1 = queue.pull(queueId1)
    const pullPromise2 = queue.pull(queueId1)

    queue.push(queueId1, 'item1')
    expect(await pullPromise1).toBe('item1')

    queue.push(queueId1, 'item2')
    expect(await pullPromise2).toBe('item2')
  })

  it('should isolate items between different queue IDs', async () => {
    queue.open(queueId1)
    queue.open(queueId2)

    queue.push(queueId1, 'itemQ1')
    queue.push(queueId2, 'itemQ2')

    expect(await queue.pull(queueId1)).toBe('itemQ1')
    expect(await queue.pull(queueId2)).toBe('itemQ2')
  })

  it('should close a queue, preventing further pushes/pulls', async () => {
    queue.open(queueId1)
    queue.push(queueId1, 'item1')
    queue.close({ id: queueId1 })

    expect(queue.isOpen(queueId1)).toBe(false)
    expect(() => queue.push(queueId1, 'item2')).toThrow(
      new Error(`[AsyncIdQueue] Cannot access queue[${queueId1}] because it is not open or aborted.`),
    )
    await expect(queue.pull(queueId1)).rejects.toThrow(
      new Error(`[AsyncIdQueue] Cannot access queue[${queueId1}] because it is not open or aborted.`),
    )
  })

  it('should reject pending pulls when a queue is closed (default reason)', async () => {
    queue.open(queueId1)
    queue.open(queueId2)
    const pullPromise1 = queue.pull(queueId1)
    const pullPromise2 = queue.pull(queueId2)

    queue.close({ id: queueId1 })

    await expect(pullPromise1).rejects.toThrow(
      new AbortError(`[AsyncIdQueue] Queue[${queueId1}] was closed or aborted while waiting for pulling.`),
    )

    queue.close()

    await expect(pullPromise2).rejects.toThrow(
      new AbortError(`[AsyncIdQueue] Queue[${queueId2}] was closed or aborted while waiting for pulling.`),
    )
  })

  it('should reject pending pulls with a custom reason when a queue is closed', async () => {
    queue.open(queueId1)
    queue.open(queueId2)
    const pullPromise1 = queue.pull(queueId1)
    const pullPromise2 = queue.pull(queueId1)
    const customError = new Error('Custom closure reason')

    queue.close({ id: queueId1, reason: customError })

    await expect(pullPromise1).rejects.toBe(customError)

    queue.close({ reason: customError })

    await expect(pullPromise2).rejects.toBe(customError)
  })

  it('close, isOpen, length', async () => {
    expect(queue.isOpen('1')).toBe(false)

    queue.open('1')
    expect(queue.isOpen('1')).toBe(true)
    expect(queue.length).toBe(1)

    queue.open('2')
    expect(queue.isOpen('2')).toBe(true)
    expect(queue.length).toBe(2)

    queue.open('3')
    expect(queue.isOpen('3')).toBe(true)
    expect(queue.length).toBe(3)

    expect(queue.isOpen('1')).toBe(true)
    expect(queue.isOpen('2')).toBe(true)
    expect(queue.isOpen('3')).toBe(true)

    queue.close({ id: '1' })
    expect(queue.isOpen('1')).toBe(false)
    expect(queue.isOpen('2')).toBe(true)
    expect(queue.isOpen('3')).toBe(true)

    queue.close()

    expect(queue.isOpen('1')).toBe(false)
    expect(queue.isOpen('2')).toBe(false)
    expect(queue.isOpen('3')).toBe(false)
  })

  it('waiterIds', async () => {
    queue.open('1')
    queue.open('2')

    const p1 = queue.pull('1')
    const p2 = queue.pull('2')

    expect(queue.waiterIds).toEqual(['1', '2'])

    queue.push('1', 'item1')
    queue.push('2', 'item2')

    await expect(p1).resolves.toBe('item1')
    await expect(p2).resolves.toBe('item2')

    expect(queue.waiterIds).toEqual([])
  })

  it('hasBufferedItems', async () => {
    queue.open('1')
    queue.open('2')

    expect(queue.hasBufferedItems('1')).toBe(false)
    expect(queue.hasBufferedItems('2')).toBe(false)

    queue.push('1', 'item1')
    queue.push('2', 'item2')

    expect(queue.hasBufferedItems('1')).toBe(true)
    expect(queue.hasBufferedItems('2')).toBe(true)

    await queue.pull('1')
    expect(queue.hasBufferedItems('1')).toBe(false)
    expect(queue.hasBufferedItems('2')).toBe(true)

    await queue.pull('2')
    expect(queue.hasBufferedItems('1')).toBe(false)
    expect(queue.hasBufferedItems('2')).toBe(false)
  })

  it('should limit buffer size based on maxBufferedSize option', async () => {
    queue = new AsyncIdQueue<string>({ maxBufferedSize: 2 })
    queue.open(queueId1)

    queue.push(queueId1, '1')
    queue.push(queueId1, '2')
    queue.push(queueId1, '3')

    expect(queue.hasBufferedItems(queueId1)).toBe(true)
    // Should have dropped '1'
    expect(await queue.pull(queueId1)).toBe('2')
    expect(await queue.pull(queueId1)).toBe('3')
    expect(queue.hasBufferedItems(queueId1)).toBe(false)
  })
})
