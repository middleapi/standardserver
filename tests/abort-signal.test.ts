import { isAsyncIteratorObject, sleep } from '@standardserver/shared'
import { createHonoFetchClientServerTest } from './client-server.hono-fetch'
import { createMessagePortClientServerTest } from './client-server.message-port'
import { createNodeFetchServerClientServerTest } from './client-server.node-fetch-server'
import { createNodeHttpClientServerTest } from './client-server.node-http'

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each([
  // ['inprogress', createInprogressClientServerTest],
  // ['inprogress-fetch', createInprogressFetchClientServerTest],
  ['hono-fetch', createHonoFetchClientServerTest],
  ['node-fetch-server', createNodeFetchServerClientServerTest],
  ['node-http', createNodeHttpClientServerTest],
  ['message-port', createMessagePortClientServerTest],
])('abort signal: $0', (_, createClientServer) => {
  const clientServer = createClientServer()

  describe('client -> server', () => {
    it('throw right away if signal already aborted', async () => {
      const abortController = new AbortController()
      abortController.abort()

      await expect(clientServer.request({
        headers: {},
        body: undefined,
        method: 'GET',
        pathname: '/',
        signal: abortController.signal,
      })).rejects.toThrow(abortController.signal.reason)

      if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
        expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(0)
        expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(0)
      }
    })

    it('sync signal', async () => {
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
        pathname: '/',
        signal: abortController.signal,
      })

      await sleep(10)
      expect(serverSignal.aborted).toBe(false)
      abortController.abort()
      await sleep(100)
      expect(serverSignal.aborted).toBe(true)

      await expect(responsePromise).rejects.toThrow(abortController.signal.reason)

      if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
        expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(2)
        expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
        expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'abort' }))

        expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(0) // abort before send anything
      }
    })

    it('stop sending event stream if aborted', async () => {
      clientServer.handler.mockImplementationOnce(async ({ signal }) => {
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
        body: (async function* () {
          try {
            yield 'Hello'
            await sleep(100)
          }
          finally {
            canceled = true
          }
        }()),
        method: 'POST',
        pathname: '/',
        signal: abortController.signal,
      })

      await sleep(10)
      abortController.abort()

      await expect(responsePromise).rejects.toThrow(abortController.signal.reason)

      await sleep(100)
      expect(canceled).toBe(true) // ensure cleanup on abort

      if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
        expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
        expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
        expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
        expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'abort' }))

        expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(0) // abort before send anything
      }
    })

    it('stop sending octet stream if aborted', async () => {
      clientServer.handler.mockImplementationOnce(async ({ signal }) => {
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
          async pull(controller) {
            controller.enqueue(new TextEncoder().encode('Hello'))
            await sleep(100)
          },
          cancel() {
            cancelled = true
          },
        }),
        method: 'POST',
        pathname: '/',
        signal: abortController.signal,
      })

      await sleep(10)
      abortController.abort()

      await expect(responsePromise).rejects.toThrow(abortController.signal.reason)

      await sleep(100)
      expect(cancelled).toBe(true) // ensure cleanup on abort

      if (clientServer.sendClientPeerMessage && clientServer.sendServerPeerMessage) {
        expect(clientServer.sendClientPeerMessage).toHaveBeenCalledTimes(3)
        expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
        expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
        expect(clientServer.sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'abort' }))

        expect(clientServer.sendServerPeerMessage).toHaveBeenCalledTimes(0) // abort before send anything
      }
    })

    it('can abort by cancel event stream response', async () => {
      let serverSignal!: AbortSignal
      let canceled = false

      clientServer.handler.mockImplementationOnce(async ({ signal }) => {
        serverSignal = signal!

        return {
          headers: {},
          status: 200,
          body: (async function* () {
            try {
              while (true) {
                yield 'Hello'
                await sleep(100)
              }
            }
            finally {
              canceled = true
            }
          }()),
        }
      })

      const response = await clientServer.request({
        headers: {},
        body: undefined,
        method: 'GET',
        pathname: '/',
      })

      const actualBody = await response.body() as AsyncGenerator
      expect(actualBody).toSatisfy(isAsyncIteratorObject)
      await actualBody.next()
      expect(serverSignal.aborted).toBe(false)
      await actualBody.return(undefined)
      await sleep(10)
      expect(serverSignal.aborted).toBe(true)
      await sleep(100)
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

    it('can abort by cancel octet stream response', async () => {
      let serverSignal!: AbortSignal
      let canceled = false

      clientServer.handler.mockImplementationOnce(async ({ signal }) => {
        serverSignal = signal!

        return {
          headers: {},
          status: 200,
          body: new ReadableStream({
            async pull(controller) {
              controller.enqueue(new TextEncoder().encode('Hello'))
              await sleep(100)
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
        pathname: '/',
      })

      const actualBody = await response.body() as ReadableStream
      expect(actualBody).toBeInstanceOf(ReadableStream)
      const reader = actualBody.getReader()

      await reader.read()
      expect(serverSignal.aborted).toBe(false)
      await reader.cancel()
      await sleep(10)
      expect(serverSignal.aborted).toBe(true)
      await sleep(100)
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
  })
})
