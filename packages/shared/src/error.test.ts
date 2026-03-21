import { AbortError, emitUnhandledRejection } from './error'
import { sleep } from './time'

it('abortError', () => {
  const error = new AbortError('Operation aborted', {
    cause: '__cause__',
  })
  expect(error.name).toBe('AbortError')
  expect(error.message).toBe('Operation aborted')
  expect(error.cause).toBe('__cause__')
})

describe('emitUnhandledRejection', () => {
  it('triggers unhandledRejection with the given error', async ({ onTestFinished }) => {
    const handleRejection = vi.fn()
    process.on('unhandledRejection', handleRejection)
    onTestFinished(() => {
      process.off('unhandledRejection', handleRejection)
    })

    const error = new Error('test error')
    emitUnhandledRejection(error)

    await sleep(0) // allow promise microtask to execute

    expect(handleRejection).toHaveBeenCalledTimes(1)
    expect(handleRejection).toHaveBeenCalledWith(error, expect.anything())
  })
})
