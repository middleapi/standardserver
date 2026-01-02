import { EventIteratorErrorEvent, resolveEventIteratorEvent, withEventIteratorEventMeta } from '@standardserver/core/event-stream'
import { isAsyncIteratorObject } from '@standardserver/shared'
import { createClientServerPeer } from './shared'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('data transfer', () => {
  const { clientPeer, serverPeer, handleRequest, sendClientPeerMessage, sendServerPeerMessage } = createClientServerPeer()

  afterEach(() => {
    // ensure cleanup correctly
    expect(clientPeer.size).toBe(0)
    expect(serverPeer.size).toBe(0)
  })

  it.each([
    () => undefined,
    () => 'string',
    () => ({ a: 1, b: [2, 3, { c: 4 }] }),
    () => new URLSearchParams('a=b&c=d'),
    () => new File(['hello world'], 'test.txt', { type: 'text/plain' }),
    () => {
      const formData = new FormData()
      formData.append('a', 'b')
      formData.append('c', 'd')
      formData.append('file', new File(['File Inside'], 'test.etc', { type: 'application/octet-stream' }))
      return formData
    },
  ])('buffered body %s', async (createBody) => {
    const method = Math.random() < 0.5 ? 'POST' : 'GET'
    const status = Math.random() < 0.5 ? 200 : 404
    const pathname = Math.random() < 0.5 ? '/test' : '/test2'

    handleRequest.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(request.body).toEqual(createBody())
      expect(request.method).toEqual(method)
      expect(request.pathname).toEqual(pathname)

      return {
        headers: {
          'x-from': 'server',
        },
        status,
        body: createBody(),
      }
    })

    const response = await clientPeer.request({
      headers: {
        'x-from': 'client',
      },
      method,
      pathname,
      body: createBody(),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(status)
    expect(response.body).toEqual(createBody())

    expect(sendClientPeerMessage).toHaveBeenCalledTimes(1)
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
    expect(sendServerPeerMessage).toHaveBeenCalledTimes(1)
    expect(sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
  })

  it('event stream', async () => {
    const generator = async function* () {
      yield 'order1'
      yield withEventIteratorEventMeta({ order: 2 }, { id: 'id-2' })
      return withEventIteratorEventMeta({ order: 3 }, { id: 'id-3' })
    }

    handleRequest.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(request.method).toEqual('DELETE')
      expect(request.pathname).toEqual('/event-stream')

      expect(request.body).toSatisfy(isAsyncIteratorObject)

      const expectedBody = generator()

      while (true) {
        const expected = await expectedBody.next()
        const actual = await (request as any).body.next()

        const [expectedData, expectedMeta] = resolveEventIteratorEvent(expected.value)
        const [actualData, actualMeta] = resolveEventIteratorEvent(actual.value)

        expect(expectedData).toEqual(actualData)
        expect(expectedMeta).toEqual(actualMeta)
        expect(actual.done).toEqual(expected.done)

        if (expected.done) {
          break
        }
      }

      return {
        headers: {
          'x-from': 'server',
        },
        status: 200,
        body: generator(),
      }
    })

    const response = await clientPeer.request({
      headers: {
        'x-from': 'client',
      },
      method: 'DELETE',
      pathname: '/event-stream',
      body: generator(),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(200)
    expect(response.body).toSatisfy(isAsyncIteratorObject)

    const expectedBody = generator()
    const actualBody = response.body

    while (true) {
      const expected = await expectedBody.next()
      const actual = await (actualBody as any).next()

      const [expectedData, expectedMeta] = resolveEventIteratorEvent(expected.value)
      const [actualData, actualMeta] = resolveEventIteratorEvent(actual.value)

      expect(expectedData).toEqual(actualData)
      expect(expectedMeta).toEqual(actualMeta)
      expect(actual.done).toEqual(expected.done)

      if (expected.done) {
        break
      }
    }

    expect(sendClientPeerMessage).toHaveBeenCalledTimes(4)
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'close' }) }))

    expect(sendServerPeerMessage).toHaveBeenCalledTimes(4)
    expect(sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
    expect(sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
    expect(sendServerPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
    expect(sendServerPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'close' }) }))
  })

  it('event stream with error event', async () => {
    const generator = async function* () {
      yield 'order1'
      yield withEventIteratorEventMeta({ order: 2 }, { id: 'id-2' })
      throw withEventIteratorEventMeta(new EventIteratorErrorEvent({ order: 3 }), { id: 'id-3' })
    }

    handleRequest.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(request.method).toEqual('DELETE')
      expect(request.pathname).toEqual('/event-stream')

      expect(request.body).toSatisfy(isAsyncIteratorObject)

      const expectedBody = generator()

      try {
        while (true) {
          // actual MUST resolve before expected to assert the error
          const actual = await (request as any).body.next()
          const expected = await expectedBody.next()

          const [expectedData, expectedMeta] = resolveEventIteratorEvent(expected.value)
          const [actualData, actualMeta] = resolveEventIteratorEvent(actual.value)

          expect(expectedData).toEqual(actualData)
          expect(expectedMeta).toEqual(actualMeta)
          expect(actual.done).toEqual(expected.done)
        }
      }
      catch (error) {
        expect(error).toBeInstanceOf(EventIteratorErrorEvent)
        const [err, errorMeta] = resolveEventIteratorEvent(error)
        expect((err as any).data).toEqual({ order: 3 })
        expect(errorMeta).toEqual({ id: 'id-3' })
      }

      return {
        headers: {
          'x-from': 'server',
        },
        status: 200,
        body: generator(),
      }
    })

    const response = await clientPeer.request({
      headers: {
        'x-from': 'client',
      },
      method: 'DELETE',
      pathname: '/event-stream',
      body: generator(),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(200)
    expect(response.body).toSatisfy(isAsyncIteratorObject)

    const expectedBody = generator()
    const actualBody = response.body

    try {
      while (true) {
        // actual MUST resolve before expected to assert the error
        const actual = await (actualBody as any).next()
        const expected = await expectedBody.next()

        const [expectedData, expectedMeta] = resolveEventIteratorEvent(expected.value)
        const [actualData, actualMeta] = resolveEventIteratorEvent(actual.value)

        expect(expectedData).toEqual(actualData)
        expect(expectedMeta).toEqual(actualMeta)
        expect(actual.done).toEqual(expected.done)
      }
    }
    catch (error) {
      expect(error).toBeInstanceOf(EventIteratorErrorEvent)
      const [err, errorMeta] = resolveEventIteratorEvent(error)
      expect((err as any).data).toEqual({ order: 3 })
      expect(errorMeta).toEqual({ id: 'id-3' })
    }

    expect(sendClientPeerMessage).toHaveBeenCalledTimes(4)
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'error' }) }))

    expect(sendServerPeerMessage).toHaveBeenCalledTimes(4)
    expect(sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
    expect(sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
    expect(sendServerPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
    expect(sendServerPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'error' }) }))
  })

  it('octet stream', async () => {
    const parts = [
      new TextEncoder().encode('part1'),
      new TextEncoder().encode('part2'),
      new TextEncoder().encode('part3'),
    ]

    const createReadableStream = () => {
      return new ReadableStream({
        start(controller) {
          for (const part of parts) {
            controller.enqueue(part)
          }

          controller.close()
        },
      })
    }

    handleRequest.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(request.method).toEqual('GET')
      expect(request.pathname).toEqual('/octet-stream')

      expect(request.body).toBeInstanceOf(ReadableStream)

      const reader = (request.body as ReadableStream).getReader()

      for (const part of parts) {
        const actual = await reader.read()
        expect(actual.value).toEqual(part)
        expect(actual.done).toEqual(false)
      }

      expect(await reader.read()).toEqual({ value: undefined, done: true })

      return {
        headers: {
          'x-from': 'server',
        },
        status: 200,
        body: createReadableStream(),
      }
    })

    const response = await clientPeer.request({
      headers: {
        'x-from': 'client',
      },
      method: 'GET',
      pathname: '/octet-stream',
      body: createReadableStream(),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(200)
    expect(response.body).toBeInstanceOf(ReadableStream)

    const reader = (response.body as ReadableStream).getReader()

    for (const part of parts) {
      const actual = await reader.read()
      expect(actual.value).toEqual(part)
      expect(actual.done).toEqual(false)
    }

    expect(await reader.read()).toEqual({ value: undefined, done: true })

    expect(sendClientPeerMessage).toHaveBeenCalledTimes(5)
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(5, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: true }) }))

    expect(sendServerPeerMessage).toHaveBeenCalledTimes(5)
    expect(sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
    expect(sendClientPeerMessage).toHaveBeenNthCalledWith(5, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: true }) }))
  })
})
