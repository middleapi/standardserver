import { Buffer } from 'node:buffer'
import { EventIteratorErrorEvent, resolveEventIteratorEvent, withEventIteratorEventMeta } from '@standardserver/core/event-stream'
import { isAsyncIteratorObject } from '@standardserver/shared'
import { createH3NodeHandlerClientServerTest } from './client-server.h3-node-handler'
import { createH3WebHandlerClientServerTest } from './client-server.h3-web-handler'
import { createHonoFetchClientServerTest } from './client-server.hono-fetch'
import { createInprogressClientServerTest } from './client-server.inprogress'
import { createInprogressFetchClientServerTest } from './client-server.inprogress-fetch'
import { createMessagePortClientServerTest } from './client-server.message-port'
import { createNodeFetchServerClientServerTest } from './client-server.node-fetch-server'
import { createNodeHttpClientServerTest } from './client-server.node-http'
import { createNodeSrvxClientServerTest } from './client-server.node-srvx'

describe.each([
  ['inprogress', createInprogressClientServerTest],
  ['inprogress-fetch', createInprogressFetchClientServerTest],
  ['h3-node-handler', createH3NodeHandlerClientServerTest],
  ['h3-web-handler', createH3WebHandlerClientServerTest],
  ['hono-fetch', createHonoFetchClientServerTest],
  ['node-srvx', createNodeSrvxClientServerTest],
  ['node-fetch-server', createNodeFetchServerClientServerTest],
  ['node-http', createNodeHttpClientServerTest],
  ['message-port', createMessagePortClientServerTest],
])('data transfer: $0', (_, createClientServer) => {
  const clientServer = createClientServer()

  beforeEach(() => {
    vi.clearAllMocks()
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
    const method = Math.random() < 0.5 ? 'POST' : 'PATCH'
    const status = Math.random() < 0.5 ? 200 : 201
    const pathname = Math.random() < 0.5 ? '/test' : '/test2'

    clientServer.handler.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(await request.body()).toEqual(createBody())
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

    const response = await clientServer.request({
      headers: {
        'x-from': 'client',
      },
      method,
      pathname,
      body: createBody(),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(status)
    expect(await response.body()).toEqual(createBody())
  })

  it('event stream', async () => {
    const generator = async function* () {
      yield 'order1'
      yield withEventIteratorEventMeta({ order: 2 }, { id: 'id-2' })
      return withEventIteratorEventMeta({ order: 3 }, { id: 'id-3' })
    }

    clientServer.handler.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(request.method).toEqual('DELETE')
      expect(request.pathname).toEqual('/event-stream')

      const actualBody = await request.body() as AsyncGenerator
      expect(actualBody).toSatisfy(isAsyncIteratorObject)

      return {
        headers: {
          'x-from': 'server',
        },
        status: 200,
        body: actualBody,
      }
    })

    const response = await clientServer.request({
      headers: {
        'x-from': 'client',
      },
      method: 'DELETE',
      pathname: '/event-stream',
      body: generator(),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(200)

    const actualBody = await response.body() as AsyncGenerator
    expect(actualBody).toSatisfy(isAsyncIteratorObject)
    const expectedBody = generator()

    while (true) {
      const expected = await expectedBody.next()
      const actual = await actualBody.next()

      const [expectedData, expectedMeta] = resolveEventIteratorEvent(expected.value)
      const [actualData, actualMeta] = resolveEventIteratorEvent(actual.value)

      expect(actualData).toEqual(expectedData)
      expect(actualMeta).toEqual(expectedMeta)
      expect(actual.done).toEqual(expected.done)

      if (expected.done) {
        break
      }
    }

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(4)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'close' }) }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(4)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'close' }) }))
    }
  })

  it('event stream with error event', async () => {
    const generator = async function* () {
      yield 'order1'
      yield withEventIteratorEventMeta({ order: 2 }, { id: 'id-2' })
      throw withEventIteratorEventMeta(new EventIteratorErrorEvent({ order: 3 }), { id: 'id-3' })
    }

    clientServer.handler.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(request.method).toEqual('DELETE')
      expect(request.pathname).toEqual('/event-stream')

      const actualBody = await request.body() as AsyncGenerator
      expect(actualBody).toSatisfy(isAsyncIteratorObject)

      return {
        headers: {
          'x-from': 'server',
        },
        status: 200,
        body: actualBody,
      }
    })

    const response = await clientServer.request({
      headers: {
        'x-from': 'client',
      },
      method: 'DELETE',
      pathname: '/event-stream',
      body: generator(),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(200)
    const actualBody = await response.body() as AsyncGenerator
    const expectedBody = generator()

    expect(actualBody).toSatisfy(isAsyncIteratorObject)

    try {
      while (true) {
        // actual MUST resolve before expected to assert the error
        const actual = await actualBody.next()
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

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(4)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'error' }) }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(4)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'message' }) }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'error' }) }))
    }
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

    clientServer.handler.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(request.method).toEqual('POST')
      expect(request.pathname).toEqual('/octet-stream')

      const actualBody = await request.body() as ReadableStream
      expect(actualBody).toBeInstanceOf(ReadableStream)

      return {
        headers: {
          'x-from': 'server',
        },
        status: 200,
        body: actualBody,
      }
    })

    const response = await clientServer.request({
      headers: {
        'x-from': 'client',
      },
      method: 'POST',
      pathname: '/octet-stream',
      body: createReadableStream(),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(200)
    const actualBody = await response.body() as ReadableStream
    console.log(actualBody)
    expect(actualBody).toBeInstanceOf(ReadableStream)

    const reader = actualBody.getReader()

    const expectedBuffer = Buffer.concat(parts)
    let actualBuffer = Buffer.from([])
    while (true) {
      const actual = await reader.read()
      if (actual.done) {
        break
      }
      actualBuffer = Buffer.concat([actualBuffer, actual.value])
    }

    expect(actualBuffer).toEqual(expectedBuffer)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(5)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(5, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: true }) }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(5)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: undefined }) }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(5, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ end: true }) }))
    }
  })
})
