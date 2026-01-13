import type { EventStreamMessage } from './types'
import { decodeEventStreamMessage, EventStreamDecoder, EventStreamDecoderStream } from './decoder'

describe('decodeEventStreamMessage', () => {
  it('on success', () => {
    expect(decodeEventStreamMessage('\n')).toEqual({})

    expect(decodeEventStreamMessage('event: message\n\n')).toEqual({
      event: 'message',
    })

    expect(decodeEventStreamMessage('event: message\ndata: hello\ndata: world\n\n')).toEqual({
      event: 'message',
      data: 'hello\nworld',
    })

    expect(decodeEventStreamMessage(': hi\n: hello\nevent: message\ndata: hello\ndata: world\n\n')).toEqual({
      event: 'message',
      data: 'hello\nworld',
      comments: ['hi', 'hello'],
    })

    expect(decodeEventStreamMessage('event: message\ndata: hello\ndata: world\nid: 123\nretry: 10000\n\n')).toEqual({
      event: 'message',
      data: 'hello\nworld',
      id: '123',
      retry: 10000,
    })
  })

  it('on success - spaces', () => {
    expect(decodeEventStreamMessage(':hi\nevent:message\ndata:hello\ndata:world\n\n')).toEqual({
      event: 'message',
      data: 'hello\nworld',
      comments: ['hi'],
    })

    expect(decodeEventStreamMessage(':  hi\nevent:  message\ndata:  hello\ndata:  world\n\n')).toEqual({
      event: ' message',
      data: ' hello\n world',
      comments: [' hi'],
    })
  })

  it('unknown keys', () => {
    expect(decodeEventStreamMessage('foo: bar\n\n')).toEqual({})
  })

  it('duplicate keys', () => {
    expect(decodeEventStreamMessage('id: 123\nid: 456\n\n')).toEqual({
      id: '456',
    })
  })

  it('invalid retry', () => {
    expect(decodeEventStreamMessage('retry: hello\n\n')).toEqual({})

    expect(decodeEventStreamMessage('retry: 1.5\n\n')).toEqual({})

    expect(decodeEventStreamMessage('retry: -1\n\n')).toEqual({})

    expect(decodeEventStreamMessage('retry: 1abc\n\n')).toEqual({ })

    expect(decodeEventStreamMessage('retry: Infinity\n\n')).toEqual({})
  })
})

describe('eventStreamDecoder', () => {
  it('on success with mixed chunks', () => {
    const onEvent = vi.fn()

    const decoder = new EventStreamDecoder(onEvent)

    decoder.feed('event: message\n')
    decoder.feed('data: hello1\n')
    decoder.feed('data: world\n\n')

    decoder.feed('event: message\ndata: hello2\ndata: world\n\n')
    // NOTE: a chunk contain 1,5 events is important test, carefully when modify
    decoder.feed('event: message\ndata: hello3\ndata: world\n\nevent: message\ndata: hello4\n')
    decoder.feed('data: world\nid: 123\nretry: 10000\n\nevent: done\ndata: hello5\ndata: world\nid: 123\nretry: 10000\n')
    decoder.feed('\n')

    decoder.end()

    expect(onEvent).toHaveBeenCalledTimes(5)
    expect(onEvent).toHaveBeenNthCalledWith(1, {
      data: 'hello1\nworld',
      event: 'message',
    })
    expect(onEvent).toHaveBeenNthCalledWith(2, {
      data: 'hello2\nworld',
      event: 'message',
    })
    expect(onEvent).toHaveBeenNthCalledWith(3, {
      data: 'hello3\nworld',
      event: 'message',
    })
    expect(onEvent).toHaveBeenNthCalledWith(4, {
      data: 'hello4\nworld',
      event: 'message',
      id: '123',
      retry: 10000,
    })
    expect(onEvent).toHaveBeenNthCalledWith(5, {
      data: 'hello5\nworld',
      event: 'done',
      id: '123',
      retry: 10000,
    })
  })

  it('on incomplete message', () => {
    const onEvent = vi.fn()

    const decoder = new EventStreamDecoder(onEvent)

    decoder.feed('event: message\ndata: hello1\ndata: world\n\n')
    decoder.feed('event: message\ndata: hello2\ndata: world\nid: 123\nretry: 10000\n')

    expect(() => decoder.end()).toThrowError('Event Iterator ended before complete')

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenNthCalledWith(1, {
      data: 'hello1\nworld',
      event: 'message',
      id: undefined,
      retry: undefined,
    })
  })
})

describe('eventStreamDecoderStream', () => {
  it('on success', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('event: message\ndata: hello1\ndata: world\n\n')
        controller.enqueue('event: message\ndata: hello2\ndata: world\nid: 123\nretry: 10000\n\n')
        controller.enqueue('event: message\ndata: hello3\ndata: world\nid: 123\nretry: 10000\n\n')
        controller.enqueue('event: done\n')
        controller.enqueue('data: hello4\n')
        controller.enqueue('data: world\n\n')
        controller.close()
      },
    }).pipeThrough(new TextEncoderStream())

    const response = new Response(stream)

    const eventStream = response.body!
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventStreamDecoderStream())

    const messages: EventStreamMessage[] = []

    for await (const message of eventStream) {
      messages.push(message)
    }

    expect(messages).toEqual([
      {
        data: 'hello1\nworld',
        event: 'message',
        id: undefined,
        retry: undefined,
      },
      {
        data: 'hello2\nworld',
        event: 'message',
        id: '123',
        retry: 10000,
      },
      {
        data: 'hello3\nworld',
        event: 'message',
        id: '123',
        retry: 10000,
      },
      {
        data: 'hello4\nworld',
        event: 'done',
        id: undefined,
        retry: undefined,
      },
    ])
  })

  it('on incomplete message', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('event: message\ndata: hello1\ndata: world\n\n')
        controller.enqueue('event: message\ndata: hello2\ndata: world\nid: 123\nretry: 10000\n')
        controller.close()
      },
    }).pipeThrough(new TextEncoderStream())

    const response = new Response(stream)

    const eventStream = response.body!
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventStreamDecoderStream())

    const messages: EventStreamMessage[] = []

    await expect(async () => {
      for await (const message of eventStream) {
        messages.push(message)
      }
    }).rejects.toThrowError('Event Iterator ended before complete')

    expect(messages).toEqual([
      {
        data: 'hello1\nworld',
        event: 'message',
        id: undefined,
        retry: undefined,
      },
    ])
  })
})
