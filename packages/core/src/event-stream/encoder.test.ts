import { encodeEventStreamMessage, encodeEventStreamMessageData } from './encoder'

it('encodeEventStreamMessageData', () => {
  expect(encodeEventStreamMessageData(undefined)).toBe('')
  expect(encodeEventStreamMessageData('hello\nworld')).toBe('data: hello\ndata: world\n')
  expect(encodeEventStreamMessageData('hello\rworld')).toBe('data: hello\ndata: world\n')
  expect(encodeEventStreamMessageData('hello\r\nworld')).toBe('data: hello\ndata: world\n')
  expect(encodeEventStreamMessageData('hello\nworld\n')).toBe('data: hello\ndata: world\ndata: \n')
  expect(encodeEventStreamMessageData('hello\rworld\r')).toBe('data: hello\ndata: world\ndata: \n')
  expect(encodeEventStreamMessageData('hello\r\nworld\r\n')).toBe('data: hello\ndata: world\ndata: \n')
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
      .toThrow('Event\'s event must not contain a carriage return or newline character')

    expect(() => encodeEventStreamMessage({ event: 'hi\r' }))
      .toThrow('Event\'s event must not contain a carriage return or newline character')

    expect(() => encodeEventStreamMessage({ event: 'hi\r\n' }))
      .toThrow('Event\'s event must not contain a carriage return or newline character')
  })

  it('invalid id', () => {
    expect(() => encodeEventStreamMessage({ event: 'message', id: 'hi\n' }))
      .toThrow('Event\'s id must not contain a carriage return or newline character')

    expect(() => encodeEventStreamMessage({ event: 'message', id: 'hi\r' }))
      .toThrow('Event\'s id must not contain a carriage return or newline character')

    expect(() => encodeEventStreamMessage({ event: 'message', id: 'hi\r\n' }))
      .toThrow('Event\'s id must not contain a carriage return or newline character')
  })

  it('invalid retry', () => {
    expect(() => encodeEventStreamMessage({ event: 'message', retry: Number.NaN }))
      .toThrow('Event\'s retry must be a integer and >= 0')

    expect(() => encodeEventStreamMessage({ event: 'message', retry: -1 }))
      .toThrow('Event\'s retry must be a integer and >= 0')

    expect(() => encodeEventStreamMessage({ event: 'message', retry: 1.5 }))
      .toThrow('Event\'s retry must be a integer and >= 0')
  })

  it('invalid comment', () => {
    expect(() => encodeEventStreamMessage({ event: 'message', comments: ['hi\n'] }))
      .toThrow('Event\'s comment must not contain a carriage return or newline character')

    expect(() => encodeEventStreamMessage({ event: 'message', comments: ['hi\r'] }))
      .toThrow('Event\'s comment must not contain a carriage return or newline character')

    expect(() => encodeEventStreamMessage({ event: 'message', comments: ['hi\r\n'] }))
      .toThrow('Event\'s comment must not contain a carriage return or newline character')
  })
})
