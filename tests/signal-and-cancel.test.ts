import { AsyncIteratorClass, isAsyncIteratorObject, sleep } from '@standardserver/shared'
import { createHonoFetchClientServerTest } from './client-server.hono-fetch'
import { createMessagePortClientServerTest } from './client-server.message-port'
import { createNodeHttpClientServerTest } from './client-server.node-http'
import { createNodeWsClientServerTest } from './client-server.node-ws'
import { createNodeWsFetchStreamedClientServerTest } from './client-server.node-ws-fetch-streamed'

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each([
  // ['inprogress', createInprogressClientServerTest],
  // ['inprogress-fetch', createInprogressFetchClientServerTest],
  // ['h3-node-handler', createH3NodeHandlerClientServerTest],
  // ['h3-web-handler', createH3WebHandlerClientServerTest],
  ['hono-fetch', createHonoFetchClientServerTest],
  // ['node-srvx', createNodeSrvxClientServerTest],
  // ['node-fetch-server', createNodeFetchServerClientServerTest],
  ['node-http', createNodeHttpClientServerTest],
  ['message-port', createMessagePortClientServerTest],
  ['node-ws', createNodeWsClientServerTest],
  ['node-ws-fetch-streamed', createNodeWsFetchStreamedClientServerTest],
] as const)('signal and cancel: $0', async (adapter, createClientServer) => {
  const clientServer = createClientServer()
  await sleep(100) // ensure everything is ready

  it('never aborted', async () => {
    let serverSignal!: AbortSignal

    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!

      await sleep(200)

      return {
        headers: {},
        status: 200,
        body: 'Hello',
      }
    })

    const response = await clientServer.request({
      headers: {},
      body: undefined,
      method: 'GET',
      url: '/',
    })

    expect(response).toMatchObject({ status: 200 })

    await sleep(100) // ensure everything is finished
    // server shouldn't abort if finished successfully
    expect(serverSignal.aborted).toBe(false)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(1)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(1)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
    }
  })

  it('already aborted', async () => {
    const abortController = new AbortController()
    abortController.abort()

    await expect(clientServer.request({
      headers: {},
      body: undefined,
      method: 'GET',
      url: '/',
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
      url: '/',
      signal: abortController.signal,
    })

    await sleep(100) // ensure server started handling
    expect(serverSignal.aborted).toBe(false)

    abortController.abort()

    await sleep(100) // wait for server receive abort signal
    expect(serverSignal.aborted).toBe(true)

    await expect(responsePromise).rejects.toThrow(abortController.signal.reason)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'cancel' }))

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
    let times = 0
    const start = Date.now()
    const abortController = new AbortController()
    const responsePromise = clientServer.request({
      headers: {},
      body: new AsyncIteratorClass(
        async () => {
          times += 1
          await sleep(times === 1 ? 100 : 1000)
          return { done: false, value: 'Hello' }
        },
        async ({ kind }) => {
          if (kind === 'cancelled') {
            canceled = true
          }
        },
      ),
      method: 'POST',
      url: '/',
      signal: abortController.signal,
    })

    await sleep(110) // wait for first chunk to be sent

    expect(serverSignal.aborted).toBe(false)
    abortController.abort()

    await sleep(100) // wait for server receive abort signal
    // Currently only message-port and node-ws adapters support request stream cancel
    if (adapter === 'message-port' || adapter === 'node-ws') {
      expect(canceled).toBe(true)
    }
    expect(serverSignal.aborted).toBe(true)
    expect(times).toBe(2) // the second chunk is being pulled
    expect(Date.now() - start).toBeLessThan(300) // cancelled in parallel without waiting for the second chunk

    await expect(responsePromise).rejects.toThrow(abortController.signal.reason)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'cancel' }))

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

    const start = Date.now()
    let cancelled = false
    let times = 0
    const abortController = new AbortController()
    const responsePromise = clientServer.request({
      headers: {},
      body: new ReadableStream({
        async pull(controller) {
          times += 1
          await sleep(times === 1 ? 100 : 1000)
          controller.enqueue(new TextEncoder().encode('Hello'))
        },
        cancel() {
          cancelled = true
        },
      }),
      method: 'POST',
      url: '/',
      signal: abortController.signal,
    })

    await sleep(110) // wait for first chunk to be sent

    expect(serverSignal.aborted).toBe(false)
    abortController.abort()

    await sleep(100) // wait for server receive abort signal
    // Currently only message-port and node-ws adapters trigger request stream cancel
    if (adapter === 'message-port' || adapter === 'node-ws') {
      expect(cancelled).toBe(true)
    }
    expect(serverSignal.aborted).toBe(true)
    expect(times).toBe(2) // the second chunk is being pulled
    expect(Date.now() - start).toBeLessThan(300) // cancelled in parallel without waiting for the second chunk

    await expect(responsePromise).rejects.toThrow(abortController.signal.reason)

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'cancel' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(0) // abort before send anything
    }
  })

  it('abort while sending response event stream', async () => {
    let canceled = false
    let serverSignal!: AbortSignal
    let times = 0
    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!

      return {
        headers: {},
        status: 200,
        body: new AsyncIteratorClass(
          async () => {
            times += 1
            await sleep(times === 1 ? 100 : 1000)
            return { done: false, value: 'Hello' }
          },
          async ({ kind }) => {
            if (kind === 'cancelled') {
              canceled = true
            }
          },
        ),
      }
    })

    const start = Date.now()
    const controller = new AbortController()
    const response = await clientServer.request({
      headers: {},
      body: null,
      method: 'POST',
      url: '/',
      signal: controller.signal,
    })

    const actualBody = await response.resolveBody() as AsyncGenerator
    expect(actualBody).toSatisfy(isAsyncIteratorObject)
    await actualBody.next()

    expect(serverSignal.aborted).toBe(false)
    controller.abort()

    await sleep(100) // wait for server receive abort signal
    expect(canceled).toBe(true)
    expect(serverSignal.aborted).toBe(true)
    expect(times).toBe(2) // the second chunk is being pulled
    expect(Date.now() - start).toBeLessThan(300) // cancelled in parallel without waiting for the second chunk

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'cancel' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
    }
  })

  it('abort while sending response octet stream', async () => {
    let canceled = false
    let serverSignal!: AbortSignal
    let times = 0
    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!

      return {
        headers: {},
        status: 200,
        body: new ReadableStream({
          async pull(controller) {
            times += 1
            await sleep(times === 1 ? 100 : 1000)
            controller.enqueue(new TextEncoder().encode('Hello'))
          },
          cancel() {
            canceled = true
          },
        }),
      }
    })

    const start = Date.now()
    const controller = new AbortController()
    const response = await clientServer.request({
      headers: {},
      body: null,
      method: 'POST',
      url: '/',
      signal: controller.signal,
    })

    const actualBody = await response.resolveBody() as ReadableStream
    expect(actualBody).toBeInstanceOf(ReadableStream)
    const reader = actualBody.getReader()
    await reader.read()

    expect(serverSignal.aborted).toBe(false)
    controller.abort()

    await sleep(100) // wait for server receive abort signal
    expect(canceled).toBe(true)
    expect(serverSignal.aborted).toBe(true)
    expect(times).toBe(2) // the second chunk is being pulled
    expect(Date.now() - start).toBeLessThan(300) // cancelled in parallel without waiting for the second chunk

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'cancel' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
    }
  })

  it('cancel unfinished response event stream', async () => {
    let serverSignal!: AbortSignal
    let canceled = false
    let times = 0
    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!

      return {
        headers: {},
        status: 200,
        body: new AsyncIteratorClass(
          async () => {
            times += 1
            await sleep(times === 1 ? 100 : 1000)
            return { done: false, value: 'Hello' }
          },
          async ({ kind }) => {
            if (kind === 'cancelled') {
              canceled = true
            }
          },
        ),
      }
    })

    const start = Date.now()
    const response = await clientServer.request({
      headers: {},
      body: undefined,
      method: 'GET',
      url: '/',
    })

    const actualBody = await response.resolveBody() as AsyncGenerator
    expect(actualBody).toSatisfy(isAsyncIteratorObject)

    await actualBody.next() // wait for first chunk
    expect(serverSignal.aborted).toBe(false)

    expect(serverSignal.aborted).toBe(false)
    await actualBody.return(undefined)

    await sleep(100) // wait for server receive cancel signal
    expect(serverSignal.aborted).toBe(true)
    expect(canceled).toBe(true)
    expect(times).toBe(2) // the second chunk is being pulled
    expect(Date.now() - start).toBeLessThan(300) // cancelled in parallel without waiting for the second chunk

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'cancel' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
    }
  })

  it('cancel unfinished response octet stream', async () => {
    let serverSignal!: AbortSignal
    let canceled = false
    let times = 0
    clientServer.handler.mockImplementationOnce(async ({ signal }) => {
      serverSignal = signal!

      return {
        headers: {},
        status: 200,
        body: new ReadableStream({
          async pull(controller) {
            times += 1
            await sleep(times === 1 ? 100 : 1000)
            controller.enqueue(new TextEncoder().encode('Hello'))
          },
          cancel() {
            canceled = true
          },
        }),
      }
    })

    const start = Date.now()
    const response = await clientServer.request({
      headers: {},
      body: undefined,
      method: 'GET',
      url: '/',
    })

    const body = await response.resolveBody() as ReadableStream
    expect(body).toBeInstanceOf(ReadableStream)
    const reader = body.getReader()

    await reader.read() // wait for first chunk

    expect(serverSignal.aborted).toBe(false)
    await reader.cancel()

    await sleep(100) // wait for server receive cancel signal
    expect(serverSignal.aborted).toBe(true)
    expect(canceled).toBe(true)
    expect(times).toBe(2) // the second chunk is being pulled
    expect(Date.now() - start).toBeLessThan(300) // cancelled in parallel without waiting for the second chunk

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'cancel' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
    }
  })

  it('cancel unfinished request event stream', async () => {
    let serverSignal!: AbortSignal

    clientServer.handler.mockImplementationOnce(async (request) => {
      serverSignal = request.signal!

      const body = await request.resolveBody() as AsyncGenerator
      expect(body).toSatisfy(isAsyncIteratorObject)

      await body.next() // wait for first chunk
      await body.return(undefined)

      return {
        headers: {},
        status: 200,
        body: 'Hello',
      }
    })

    let canceled = false
    let times = 0
    const start = Date.now()
    const response = await clientServer.request({
      headers: {},
      body: new AsyncIteratorClass(
        async () => {
          times += 1
          await sleep(times === 1 ? 100 : 1000)
          return { done: false, value: 'Hello' }
        },
        async ({ kind }) => {
          if (kind === 'cancelled') {
            canceled = true
          }
        },
      ),
      method: 'POST',
      url: '/',
    })

    expect(response).toMatchObject({ status: 200 })

    // Currently only message port and node-ws adapters support trigger request stream cancel
    expect(canceled).toBe(adapter === 'message-port' || adapter === 'node-ws' || adapter === 'node-ws-fetch-streamed')
    expect(serverSignal.aborted).toBe(false) // DO NOT ABORT IF ONLY CANCEL REQUEST BODY
    expect(times).toBe(2) // the second chunk is being pulled
    expect(Date.now() - start).toBeLessThan(300) // cancelled in parallel without waiting for the second chunk

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'stream/cancel' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'response' }))
    }
  })

  it('cancel unfinished request octet stream', async () => {
    let serverSignal!: AbortSignal

    clientServer.handler.mockImplementationOnce(async (request) => {
      serverSignal = request.signal!

      const body = await request.resolveBody() as ReadableStream
      expect(body).toBeInstanceOf(ReadableStream)

      const reader = body.getReader()
      await reader.read() // wait for first chunk
      await reader.cancel()

      return {
        headers: {},
        status: 200,
        body: 'Hello',
      }
    })

    let canceled = false
    let times = 0
    const start = Date.now()
    const response = await clientServer.request({
      headers: {},
      body: new ReadableStream({
        pull: async (controller) => {
          times += 1
          await sleep(times === 1 ? 100 : 1000)
          controller.enqueue(new TextEncoder().encode('Hello'))
        },
        cancel: async () => {
          canceled = true
        },
      }),
      method: 'POST',
      url: '/',
    })

    expect(response).toMatchObject({ status: 200 })

    // Currently only message-port and node-ws adapters support trigger request stream cancel
    expect(canceled).toBe(adapter === 'message-port' || adapter === 'node-ws' || adapter === 'node-ws-fetch-streamed')
    expect(serverSignal.aborted).toBe(false) // DO NOT ABORT IF ONLY CANCEL REQUEST BODY
    expect(times).toBe(2) // the second chunk is being pulled
    expect(Date.now() - start).toBeLessThan(300) // cancelled in parallel without waiting for the second chunk

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'stream/cancel' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'response' }))
    }
  })

  it('error happen while sending request event stream', async () => {
    let serverSignal!: AbortSignal
    let serverError!: unknown
    let canceled = false

    clientServer.handler.mockImplementationOnce(async (request) => {
      serverSignal = request.signal!

      const body = await request.resolveBody() as AsyncGenerator
      expect(body).toSatisfy(isAsyncIteratorObject)

      await body.next()
      try {
        await body.next() // pull second chunk where error happen
      }
      catch (e) {
        serverError = e
      }

      return {
        headers: {},
        status: 200,
        body: 'Hello',
      }
    })

    let times = 0
    const responsePromise = clientServer.request({
      headers: {},
      body: new AsyncIteratorClass(
        async () => {
          times++

          await sleep(100)

          if (times !== 1) {
            // throw normal error not async iterator object error
            throw new Error('__TEST__')
          }

          return { done: false, value: 'Hello' }
        },
        async (completed) => {
          if (!completed) {
            canceled = true
          }
        },
      ),
      method: 'POST',
      url: '/',
    })

    await expect(responsePromise).rejects.toThrow()

    await sleep(100) // wait for server handle abort
    expect(serverSignal.aborted).toBe(true)
    expect(serverError).toBeInstanceOf(Error)
    expect(times).toBe(2) // stop at second chunk
    expect(canceled).toBe(false) // don't need cancel if error happen

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'cancel' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(0)
    }
  })

  it('error happen while sending request octet stream', async () => {
    let serverSignal!: AbortSignal
    let canceled = false
    let serverError!: unknown

    clientServer.handler.mockImplementationOnce(async (request) => {
      serverSignal = request.signal!

      const body = await request.resolveBody() as ReadableStream
      expect(body).toBeInstanceOf(ReadableStream)

      const reader = body.getReader()
      await reader.read()
      try {
        await reader.read() // pull second chunk where error happen
      }
      catch (e) {
        serverError = e
      }

      return {
        headers: {},
        status: 200,
        body: 'Hello',
      }
    })

    const error = new Error('__TEST__')
    let times = 0
    const responsePromise = clientServer.request({
      headers: {},
      body: new ReadableStream({
        pull: async (controller) => {
          times += 1
          await sleep(100)

          if (times !== 1) {
            controller.error(error)
          }

          controller.enqueue(new TextEncoder().encode('Hello'))
        },
        cancel: async (reason) => {
          canceled = true
        },
      }),
      method: 'POST',
      url: '/',
    })

    if (adapter === 'message-port' || adapter === 'node-ws') {
      await expect(responsePromise).rejects.toThrow(error)
    }
    else {
      await expect(responsePromise).rejects.toThrow()
    }

    await sleep(100) // wait for server handle abort
    expect(serverSignal.aborted).toBe(true)
    expect(serverError).toBeInstanceOf(Error)
    expect(times).toBe(2) // stop at second chunk
    expect(canceled).toBe(false) // don't need cancel if error happen

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'cancel' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(0)
    }
  })

  it('error happen while sending response event stream', async () => {
    let canceled = false
    let serverSignal!: AbortSignal
    let times = 0

    clientServer.handler.mockImplementationOnce(async (request) => {
      serverSignal = request.signal!

      return {
        headers: {},
        status: 200,
        body: new AsyncIteratorClass(
          async () => {
            times += 1
            await sleep(100)

            if (times !== 1) {
            // throw normal error not async iterator object error
              throw new Error('__TEST__')
            }

            return { done: false, value: 'Hello' }
          },
          async (completed) => {
            if (!completed) {
              canceled = true
            }
          },
        ),
      }
    })

    const response = await clientServer.request({
      headers: {},
      body: undefined,
      method: 'POST',
      url: '/',
    })

    const body = await response.resolveBody() as AsyncGenerator
    expect(body).toSatisfy(isAsyncIteratorObject)

    await body.next()
    await expect(body.next()).rejects.toBeInstanceOf(Error)

    await sleep(100) // wait until serve handled error
    expect(serverSignal.aborted).toBe(true)
    expect(times).toBe(2) // stop at second chunk
    expect(canceled).toBe(false) // don't need cancel if error happen

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(1)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'cancel' }))
    }
  })

  it('error happen while sending response octet stream', async () => {
    let canceled = false
    let serverSignal!: AbortSignal
    let times = 0

    clientServer.handler.mockImplementationOnce(async (request) => {
      serverSignal = request.signal!

      return {
        headers: {},
        status: 200,
        body: new ReadableStream({
          pull: async (controller) => {
            times += 1
            await sleep(100)

            if (times === 2) {
              controller.error(new Error('__TEST__'))
            }

            controller.enqueue(new TextEncoder().encode('Hello'))
          },
          cancel: async () => {
            canceled = true
          },
        }),
      }
    })

    const response = await clientServer.request({
      headers: {},
      body: undefined,
      method: 'POST',
      url: '/',
    })

    const body = await response.resolveBody() as ReadableStream
    expect(body).toBeInstanceOf(ReadableStream)

    const reader = body.getReader()
    await reader.read()
    await expect(reader.read()).rejects.toBeInstanceOf(Error)

    await sleep(100) // wait until serve handled error
    expect(serverSignal.aborted).toBe(true)
    expect(times).toBe(2) // stop at second chunk
    expect(canceled).toBe(false) // don't need cancel if error happen

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(1)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'cancel' }))
    }
  })

  it('error happen while sending request event stream and streaming response', async () => {
    let serverSignal!: AbortSignal
    let serverError!: unknown
    let canceled = false

    clientServer.handler.mockImplementationOnce(async (request) => {
      serverSignal = request.signal!

      ;(async () => {
        const body = await request.resolveBody() as AsyncGenerator
        expect(body).toSatisfy(isAsyncIteratorObject)
        await body.next()
        try {
          await body.next() // pull second chunk where error happen
        }
        catch (e) {
          serverError = e
        }
      })()

      let time = 0
      return {
        headers: {},
        status: 200,
        body: new AsyncIteratorClass(async () => {
          time += 1
          if (time > 1) {
            await sleep(300)
          }
          return { value: 'chunk' }
        }, vi.fn()),
      }
    })

    let times = 0
    const responsePromise = clientServer.request({
      headers: {},
      body: new AsyncIteratorClass(
        async () => {
          times++

          if (times !== 1) {
            await sleep(200)
            // throw normal error not async iterator object error
            throw new Error('__TEST__')
          }

          return { done: false, value: 'Hello' }
        },
        async (completed) => {
          if (!completed) {
            canceled = true
          }
        },
      ),
      method: 'POST',
      url: '/',
    })

    const response = await responsePromise
    const iterator = await response.resolveBody() as AsyncIteratorClass<any>

    await expect(iterator.next().then(() => iterator.next())).rejects.toThrow(Error)

    await sleep(100) // wait for server handle abort
    expect(serverSignal.aborted).toBe(true)
    expect(serverError).toBeInstanceOf(Error)
    expect(times).toBe(2) // stop at second chunk
    expect(canceled).toBe(false) // don't need cancel if error happen

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'cancel' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
    }
  })

  it('error happen while sending request octet stream and streaming response', async () => {
    let serverSignal!: AbortSignal
    let serverError!: unknown
    let canceled = false

    clientServer.handler.mockImplementationOnce(async (request) => {
      serverSignal = request.signal!

      ;(async () => {
        const body = await request.resolveBody() as ReadableStream
        expect(body).toBeInstanceOf(ReadableStream)

        const reader = body.getReader()
        await reader.read()
        try {
          await reader.read() // pull second chunk where error happen
        }
        catch (e) {
          serverError = e
        }
      })()

      await sleep(100)

      return {
        headers: {},
        status: 200,
        body: new ReadableStream({
          pull: async (controller) => {
            controller.enqueue(new TextEncoder().encode('chunk\n'))
            // only wait after send first chunk, to ensure response send immediately
            await sleep(300)
          },
        }),
      }
    })

    let times = 0
    const responsePromise = clientServer.request({
      headers: {},
      body: new ReadableStream({
        pull: async (controller) => {
          times += 1

          if (times !== 1) {
            await sleep(200)
            controller.error(new Error('__TEST__'))
          }

          controller.enqueue(new TextEncoder().encode('chunk\n'))
        },
        cancel: async (reason) => {
          canceled = true
        },
      }),
      method: 'POST',
      url: '/',
    })

    const response = await responsePromise
    const body = await response.resolveBody() as ReadableStream

    const reader = body.getReader()

    await expect(reader.read().then(() => reader.read())).rejects.toThrow(Error)

    await sleep(100) // wait for server handle abort
    expect(serverSignal.aborted).toBe(true)
    expect(serverError).toBeInstanceOf(Error)
    expect(times).toBe(2) // stop at second chunk
    expect(canceled).toBe(false) // don't need cancel if error happen

    if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
      expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
      expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'cancel' }))

      expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(clientServer.sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
    }
  })
})
