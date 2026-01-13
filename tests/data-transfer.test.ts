import type { StandardUrl } from '@standardserver/core'
import { EventIteratorErrorEvent, resolveEventIteratorEvent, withEventIteratorEventMeta } from '@standardserver/core/event-stream'
import { isAsyncIteratorObject, sleep } from '@standardserver/shared'
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
  // ['h3-node-handler', createH3NodeHandlerClientServerTest],
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
    const url: StandardUrl = Math.random() < 0.5 ? '/test' : '/test2?query=1'

    clientServer.handler.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(await request.resolveBody()).toEqual(createBody())
      expect(request.method).toEqual(method)
      expect(request.url).toEqual(url)

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
      url,
      body: createBody(),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(status)
    expect(await response.resolveBody()).toEqual(createBody())
  })

  it('event stream in parallel', async () => {
    clientServer.handler.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(request.method).toEqual('DELETE')
      expect(request.url).toEqual('/event-stream')

      const body = await request.resolveBody() as AsyncGenerator
      expect(body).toSatisfy(isAsyncIteratorObject)

      return {
        headers: {
          'x-from': 'server',
        },
        status: 200,
        body,
      }
    })

    let start = Date.now()
    const response = await clientServer.request({
      headers: {
        'x-from': 'client',
      },
      method: 'DELETE',
      url: '/event-stream',
      body: (async function* () {
        await sleep(100)
        yield 'order1'
        await sleep(100)
        yield withEventIteratorEventMeta({ order: 2 }, { id: 'id-2' })
        await sleep(100)
        return withEventIteratorEventMeta({ order: 3 }, { comments: ['order3'] })
      }()),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(200)

    const body = await response.resolveBody() as AsyncGenerator
    expect(body).toSatisfy(isAsyncIteratorObject)

    await expect(body.next()).resolves.toSatisfy((result) => {
      expect(result.done).toBe(false)
      const [data, meta] = resolveEventIteratorEvent(result.value)
      expect(data).toEqual('order1')
      expect(meta).toEqual(undefined)
      return true
    })
    expect(Date.now() - start).toBeLessThan(200)
    start = Date.now()

    await expect(body.next()).resolves.toSatisfy((result) => {
      expect(result.done).toBe(false)
      const [data, meta] = resolveEventIteratorEvent(result.value)
      expect(data).toEqual({ order: 2 })
      expect(meta).toEqual({ id: 'id-2' })
      return true
    })
    expect(Date.now() - start).toBeLessThan(200)
    start = Date.now()

    await expect(body.next()).resolves.toSatisfy((result) => {
      expect(result.done).toBe(true)
      const [data, meta] = resolveEventIteratorEvent(result.value)
      expect(data).toEqual({ order: 3 })
      expect(meta).toEqual({ comments: ['order3'] })
      return true
    })
    expect(Date.now() - start).toBeLessThan(200)

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

  it('event stream with error event in parallel', async () => {
    clientServer.handler.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(request.method).toEqual('DELETE')
      expect(request.url).toEqual('/event-stream')

      const actualBody = await request.resolveBody() as AsyncGenerator
      expect(actualBody).toSatisfy(isAsyncIteratorObject)

      return {
        headers: {
          'x-from': 'server',
        },
        status: 200,
        body: actualBody,
      }
    })

    let start = Date.now()
    const response = await clientServer.request({
      headers: {
        'x-from': 'client',
      },
      method: 'DELETE',
      url: '/event-stream',
      body: (async function* () {
        await sleep(100)
        yield 'order1'
        await sleep(100)
        yield withEventIteratorEventMeta({ order: 2 }, { id: 'id-2' })
        throw withEventIteratorEventMeta(new EventIteratorErrorEvent({ order: 3 }), { comments: ['order3'] })
      }()),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(200)
    const body = await response.resolveBody() as AsyncGenerator
    expect(body).toSatisfy(isAsyncIteratorObject)

    await expect(body.next()).resolves.toSatisfy((result) => {
      expect(result.done).toBe(false)
      const [data, meta] = resolveEventIteratorEvent(result.value)
      expect(data).toEqual('order1')
      expect(meta).toEqual(undefined)
      return true
    })
    expect(Date.now() - start).toBeLessThan(200)
    start = Date.now()

    await expect(body.next()).resolves.toSatisfy((result) => {
      expect(result.done).toBe(false)
      const [data, meta] = resolveEventIteratorEvent(result.value)
      expect(data).toEqual({ order: 2 })
      expect(meta).toEqual({ id: 'id-2' })
      return true
    })
    expect(Date.now() - start).toBeLessThan(200)
    start = Date.now()

    await expect(body.next()).rejects.toSatisfy((error: EventIteratorErrorEvent) => {
      expect(error).toBeInstanceOf(EventIteratorErrorEvent)
      const [err, errMeta] = resolveEventIteratorEvent(error)
      expect(err.data).toEqual({ order: 3 })
      expect(errMeta).toEqual({ comments: ['order3'] })
      return true
    })
    expect(Date.now() - start).toBeLessThan(200)
    start = Date.now()

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

  it('octet stream in parallel', async () => {
    clientServer.handler.mockImplementationOnce(async (request) => {
      expect(request.headers['x-from']).toEqual('client')
      expect(request.method).toEqual('POST')
      expect(request.url).toEqual('/octet-stream')

      const body = await request.resolveBody() as ReadableStream
      expect(body).toBeInstanceOf(ReadableStream)

      return {
        headers: {
          'x-from': 'server',
        },
        status: 200,
        body,
      }
    })

    let start = Date.now()
    const response = await clientServer.request({
      headers: {
        'x-from': 'client',
      },
      method: 'POST',
      url: '/octet-stream',
      body: new ReadableStream({
        async start(controller) {
          // make sure each chunk is long enough to ensure client/server transfer separately
          await sleep(100)
          controller.enqueue(new TextEncoder().encode('chunk1'.repeat(10)))
          await sleep(100)
          controller.enqueue(new TextEncoder().encode('chunk2'.repeat(10)))
          await sleep(100)
          controller.enqueue(new TextEncoder().encode('chunk3'.repeat(10)))
          await sleep(100)
          controller.close()
        },
      }),
    })

    expect(response.headers['x-from']).toEqual('server')
    expect(response.status).toEqual(200)
    const body = await response.resolveBody() as ReadableStream
    expect(body).toBeInstanceOf(ReadableStream)
    const reader = body.getReader()

    await expect(reader.read()).resolves.toEqual({ done: false, value: new TextEncoder().encode('chunk1'.repeat(10)) })
    expect(Date.now() - start).toBeLessThan(200)
    start = Date.now()

    await expect(reader.read()).resolves.toEqual({ done: false, value: new TextEncoder().encode('chunk2'.repeat(10)) })
    expect(Date.now() - start).toBeLessThan(200)
    start = Date.now()

    await expect(reader.read()).resolves.toEqual({ done: false, value: new TextEncoder().encode('chunk3'.repeat(10)) })
    expect(Date.now() - start).toBeLessThan(200)
    start = Date.now()

    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined })
    expect(Date.now() - start).toBeLessThan(200)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(5)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ close: false }) }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ close: false }) }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ close: false }) }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(5, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ close: true }) }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(5)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ close: false }) }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ close: false }) }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ close: false }) }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(5, expect.objectContaining({ kind: 'octet-stream', json: expect.objectContaining({ close: true }) }))
    }
  })
})
