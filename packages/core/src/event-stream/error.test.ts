import { EventIteratorErrorEvent } from './error'

it('eventIteratorErrorEvent', () => {
  const errorEvent = new EventIteratorErrorEvent('data', { cause: 'cause' })

  expect(errorEvent.message).toBe('Error Event')
  expect(errorEvent.cause).toBe('cause')
  expect(errorEvent.data).toBe('data')

  const errorEventWithCustomMessage = new EventIteratorErrorEvent('data', { message: 'custom message' })
  expect(errorEventWithCustomMessage.message).toBe('custom message')
})
