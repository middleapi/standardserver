import { encodeEventStreamMessage, encodeEventStreamMessageData } from './encoder'

it('encodeEventStreamMessageData', () => {
  expect(encodeEventStreamMessageData(undefined)).toBe('')
  expect(encodeEventStreamMessageData('hello\nworld')).toBe('data: hello\ndata: world\n')
  expect(encodeEventStreamMessageData('hello\nworld\n')).toBe('data: hello\ndata: world\ndata: \n')
})

describe('encodeEventStreamMessage', () => {
  it('on success', () => {
    expect(encodeEventStreamMessage({})).toEqual('\n')
    expect(encodeEventStreamMessage({ event: 'message', data: 'hello\nworld' })).toEqual('event: message\ndata: hello\ndata: world\n\n')
    expect(encodeEventStreamMessage({ event: 'message', id: '123', retry: 10000 }))
      .toEqual('event: message\nretry: 10000\nid: 123\n\n')
    expect(encodeEventStreamMessage({ event: 'message', id: '123', retry: 10000, comments: ['hello', 'world'] }))
      .toEqual(': hello\n: world\nevent: message\nretry: 10000\nid: 123\n\n')
  })

  it('invalid event', () => {
    expect(() => encodeEventStreamMessage({ event: 'hi\n' }))
      .toThrowError('Event\'s event must not contain a newline character')
  })

  it('invalid id', () => {
    expect(() => encodeEventStreamMessage({ event: 'message', id: 'hi\n' }))
      .toThrowError('Event\'s id must not contain a newline character')
  })

  it('invalid retry', () => {
    expect(() => encodeEventStreamMessage({ event: 'message', retry: Number.NaN }))
      .toThrowError('Event\'s retry must be a integer and >= 0')

    expect(() => encodeEventStreamMessage({ event: 'message', retry: -1 }))
      .toThrowError('Event\'s retry must be a integer and >= 0')

    expect(() => encodeEventStreamMessage({ event: 'message', retry: 1.5 }))
      .toThrowError('Event\'s retry must be a integer and >= 0')
  })

  it('invalid comment', () => {
    expect(() => encodeEventStreamMessage({ event: 'message', comments: ['hi\n'] }))
      .toThrowError('Event\'s comment must not contain a newline character')
  })
})
