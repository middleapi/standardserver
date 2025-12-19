import { ErrorEvent } from './error'

it('errorEvent', () => {
  const errorEvent = new ErrorEvent('data', { cause: 'cause' })

  expect(errorEvent.message).toBe('An error event was received')
  expect(errorEvent.cause).toBe('cause')
  expect(errorEvent.data).toBe('data')

  const errorEventWithCustomMessage = new ErrorEvent('data', { message: 'custom message' })
  expect(errorEventWithCustomMessage.message).toBe('custom message')
})
