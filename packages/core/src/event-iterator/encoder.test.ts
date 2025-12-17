import { encodeEventData, encodeEventMessage } from './encoder'

it('encodeEventData', () => {
  expect(encodeEventData(undefined)).toBe('')
  expect(encodeEventData('hello\nworld')).toBe('data: hello\ndata: world\n')
  expect(encodeEventData('hello\nworld\n')).toBe('data: hello\ndata: world\ndata: \n')
})

describe('encodeEventMessage', () => {
  it('on success', () => {
    expect(encodeEventMessage({})).toEqual('\n')
    expect(encodeEventMessage({ event: 'message', data: 'hello\nworld' })).toEqual('event: message\ndata: hello\ndata: world\n\n')
    expect(encodeEventMessage({ event: 'message', id: '123', retry: 10000 }))
      .toEqual('event: message\nretry: 10000\nid: 123\n\n')
    expect(encodeEventMessage({ event: 'message', id: '123', retry: 10000, comments: ['hello', 'world'] }))
      .toEqual(': hello\n: world\nevent: message\nretry: 10000\nid: 123\n\n')
  })

  it('invalid event', () => {
    expect(() => encodeEventMessage({ event: 'hi\n' }))
      .toThrowError('Event\'s event must not contain a newline character')
  })

  it('invalid id', () => {
    expect(() => encodeEventMessage({ event: 'message', id: 'hi\n' }))
      .toThrowError('Event\'s id must not contain a newline character')
  })

  it('invalid retry', () => {
    expect(() => encodeEventMessage({ event: 'message', retry: Number.NaN }))
      .toThrowError('Event\'s retry must be a integer and >= 0')

    expect(() => encodeEventMessage({ event: 'message', retry: -1 }))
      .toThrowError('Event\'s retry must be a integer and >= 0')

    expect(() => encodeEventMessage({ event: 'message', retry: 1.5 }))
      .toThrowError('Event\'s retry must be a integer and >= 0')
  })

  it('invalid comment', () => {
    expect(() => encodeEventMessage({ event: 'message', comments: ['hi\n'] }))
      .toThrowError('Event\'s comment must not contain a newline character')
  })
})
