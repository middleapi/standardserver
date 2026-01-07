import { stringToUrl } from '@standardserver/core'
import { AsyncIteratorClass, isAsyncIteratorObject, sleep } from '@standardserver/shared'
import { createH3WebHandlerClientServerTest } from './client-server.h3-web-handler'
import { createHonoFetchClientServerTest } from './client-server.hono-fetch'
import { createMessagePortClientServerTest } from './client-server.message-port'
import { createNodeFetchServerClientServerTest } from './client-server.node-fetch-server'
import { createNodeHttpClientServerTest } from './client-server.node-http'
import { createNodeSrvxClientServerTest } from './client-server.node-srvx'

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each([
  // ['inprogress', createInprogressClientServerTest],
  // ['inprogress-fetch', createInprogressFetchClientServerTest],
  // ['h3-node-handler', createH3NodeHandlerClientServerTest],
  ['h3-web-handler', createH3WebHandlerClientServerTest],
  ['hono-fetch', createHonoFetchClientServerTest],
  ['node-srvx', createNodeSrvxClientServerTest],
  ['node-fetch-server', createNodeFetchServerClientServerTest],
  ['node-http', createNodeHttpClientServerTest],
  ['message-port', createMessagePortClientServerTest],
])('signal and cancel: $0', (_, createClientServer) => {
  const clientServer = createClientServer()

  it('already aborted', async () => {
    const abortController = new AbortController()
    abortController.abort()

    await expect(clientServer.request({
      headers: {},
      body: undefined,
      method: 'GET',
      url: stringToUrl('/'),
      signal: abortController.signal,
    })).rejects.toThrow(abortController.signal.reason)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(0)
      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(0)
    }
  })

  it('abort while handling', async () => {
    let serverSignal!: AbortSignal

    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!

      await sleep(1000)

      return {
        headers: {},
        status: 200,
        body: 'Hello',
      }
    })

    const abortController = new AbortController()
    const responsePromise = clientServer.request({
      headers: {},
      body: undefined,
      method: 'GET',
      url: stringToUrl('/'),
      signal: abortController.signal,
    })

    await sleep(10) // ensure server started handling
    expect(serverSignal.aborted).toBe(false)

    abortController.abort()

    await sleep(10) // wait for server to receive abort
    expect(serverSignal.aborted).toBe(true)

    await expect(responsePromise).rejects.toThrow(abortController.signal.reason)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'abort' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(0) // abort before send anything
    }
  })

  it('abort while sending request event stream', async () => {
    let serverSignal!: AbortSignal
    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!
      await sleep(1000)

      return {
        headers: {},
        status: 200,
        body: 'Hello',
      }
    })

    let canceled = false
    const abortController = new AbortController()
    const responsePromise = clientServer.request({
      headers: {},
      body: new AsyncIteratorClass(
        async () => {
          await sleep(100)
          return { done: false, value: 'Hello' }
        },
        async () => {
          canceled = true
        },
      ),
      method: 'POST',
      url: stringToUrl('/'),
      signal: abortController.signal,
    })

    await sleep(110) // wait for first chunk to be sent

    expect(serverSignal.aborted).toBe(false)
    abortController.abort()

    await expect(responsePromise).rejects.toThrow(abortController.signal.reason)
    expect(canceled).toBe(true)
    expect(serverSignal.aborted).toBe(true)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'abort' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(0) // abort before send anything
    }
  })

  it('abort while sending request octet stream', async () => {
    let serverSignal!: AbortSignal
    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!
      await sleep(1000)

      return {
        headers: {},
        status: 200,
        body: 'Hello',
      }
    })

    let cancelled = false
    const abortController = new AbortController()
    const responsePromise = clientServer.request({
      headers: {},
      body: new ReadableStream({
        async start(controller) {
        },
        async pull(controller) {
          await sleep(100)
          controller.enqueue(new TextEncoder().encode('Hello'))
        },
        cancel() {
          cancelled = true
        },
      }),
      method: 'POST',
      url: stringToUrl('/'),
      signal: abortController.signal,
    })

    await sleep(110) // wait for first chunk to be sent

    expect(serverSignal.aborted).toBe(false)
    abortController.abort()

    await expect(responsePromise).rejects.toThrow(abortController.signal.reason)

    await sleep(100)
    expect(cancelled).toBe(true) // ensure cleanup on abort
    expect(serverSignal.aborted).toBe(true)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'abort' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(0) // abort before send anything
    }
  })

  it('abort while sending response event stream', async () => {
    let canceled = false
    let serverSignal!: AbortSignal
    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!

      return {
        headers: {},
        status: 200,
        body: new AsyncIteratorClass(
          async () => {
            await sleep(100)
            return { done: false, value: 'Hello' }
          },
          async () => {
            canceled = true
          },
        ),
      }
    })

    const controller = new AbortController()
    const response = await clientServer.request({
      headers: {},
      body: null,
      method: 'POST',
      url: stringToUrl('/'),
      signal: controller.signal,
    })

    const actualBody = await response.body() as AsyncGenerator
    expect(actualBody).toSatisfy(isAsyncIteratorObject)
    await actualBody.next()

    expect(serverSignal.aborted).toBe(false)
    controller.abort()

    await sleep(100) // wait for cleanup effect
    expect(canceled).toBe(true)
    expect(serverSignal.aborted).toBe(true)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'abort' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
    }
  })

  it('abort while sending response octet stream', async () => {
    let canceled = false
    let serverSignal!: AbortSignal
    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!

      return {
        headers: {},
        status: 200,
        body: new ReadableStream({
          async pull(controller) {
            await sleep(100)
            controller.enqueue(new TextEncoder().encode('Hello'))
          },
          cancel() {
            canceled = true
          },
        }),
      }
    })

    const controller = new AbortController()
    const response = await clientServer.request({
      headers: {},
      body: null,
      method: 'POST',
      url: stringToUrl('/'),
      signal: controller.signal,
    })

    const actualBody = await response.body() as ReadableStream
    expect(actualBody).toBeInstanceOf(ReadableStream)
    const reader = actualBody.getReader()
    await reader.read()

    expect(serverSignal.aborted).toBe(false)
    controller.abort()

    await sleep(100) // wait for cleanup effect
    expect(canceled).toBe(true)
    expect(serverSignal.aborted).toBe(true)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'abort' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
    }
  })

  it('cancel unfinished response event stream', async () => {
    let serverSignal!: AbortSignal
    let canceled = false

    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!

      return {
        headers: {},
        status: 200,
        body: new AsyncIteratorClass(
          async () => {
            await sleep(100)
            return { done: false, value: 'Hello' }
          },
          async () => {
            canceled = true
          },
        ),
      }
    })

    const response = await clientServer.request({
      headers: {},
      body: undefined,
      method: 'GET',
      url: stringToUrl('/'),
    })

    const actualBody = await response.body() as AsyncGenerator
    expect(actualBody).toSatisfy(isAsyncIteratorObject)

    await actualBody.next() // wait for first chunk
    expect(serverSignal.aborted).toBe(false)

    expect(serverSignal.aborted).toBe(false)
    await actualBody.return(undefined)

    await sleep(10) // wait for cleanup effect
    expect(serverSignal.aborted).toBe(true)
    expect(canceled).toBe(true)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'abort' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
    }
  })

  it('cancel unfinished response octet stream', async () => {
    let serverSignal!: AbortSignal
    let canceled = false

    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!

      return {
        headers: {},
        status: 200,
        body: new ReadableStream({
          async pull(controller) {
            await sleep(100)
            controller.enqueue(new TextEncoder().encode('Hello'))
          },
          cancel() {
            canceled = true
          },
        }),
      }
    })

    const response = await clientServer.request({
      headers: {},
      body: undefined,
      method: 'GET',
      url: stringToUrl('/'),
    })

    const body = await response.body() as ReadableStream
    expect(body).toBeInstanceOf(ReadableStream)
    const reader = body.getReader()

    await reader.read() // wait for first chunk

    expect(serverSignal.aborted).toBe(false)
    await reader.cancel()

    await sleep(10) // wait for cleanup effect
    expect(serverSignal.aborted).toBe(true)
    expect(canceled).toBe(true)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'abort' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
    }
  })

  it('cancel unfinished request event stream', async () => {
    let canceled = false
    let serverSignal!: AbortSignal

    clientServer.handler.mockImplementationOnce(async (request) => {
      serverSignal = request.signal!

      const body = await request.body() as AsyncGenerator
      expect(body).toSatisfy(isAsyncIteratorObject)

      await body.next() // wait for first chunk
      await body.return(undefined)

      await sleep(10) // wait for cancel effect
      expect(canceled).toBe(true)
      expect(serverSignal.aborted).toBe(false) // DO NOT ABORT IF ONLY CANCEL REQUEST BODY

      return {
        headers: {},
        status: 200,
        body: 'Hello',
      }
    })

    const responsePromise = clientServer.request({
      headers: {},
      body: new AsyncIteratorClass(
        async () => {
          await sleep(100)
          return { done: false, value: 'Hello' }
        },
        async () => {
          canceled = true
        },
      ),
      method: 'POST',
      url: stringToUrl('/'),
    })

    await sleep(110) // wait for first chunk to be sent

    await responsePromise

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'event-stream/cancel' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'response' }))
    }
  })

  it('cancel unfinished request octet stream', async () => {
    let canceled = false
    let serverSignal!: AbortSignal

    clientServer.handler.mockImplementationOnce(async (request) => {
      serverSignal = request.signal!

      const body = await request.body() as ReadableStream
      expect(body).toBeInstanceOf(ReadableStream)

      const reader = body.getReader()
      await reader.read() // wait for first chunk
      await reader.cancel()

      await sleep(10) // wait for cancel effect
      expect(canceled).toBe(true)
      expect(serverSignal.aborted).toBe(false) // DO NOT ABORT IF ONLY CANCEL REQUEST BODY

      return {
        headers: {},
        status: 200,
        body: 'Hello',
      }
    })

    const responsePromise = clientServer.request({
      headers: {},
      body: new ReadableStream({
        pull: async (controller) => {
          await sleep(100)
          controller.enqueue(new TextEncoder().encode('Hello'))
        },
        cancel: async () => {
          canceled = true
        },
      }),
      method: 'POST',
      url: stringToUrl('/'),
    })

    await sleep(110)

    await responsePromise

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'octet-stream/cancel' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'response' }))
    }
  })
})
