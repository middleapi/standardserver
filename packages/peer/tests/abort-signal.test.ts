import { isAsyncIteratorObject, sleep } from '@standardserver/shared'
import { createClientServerPeer } from './shared'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('abort signal', () => {
  const { clientPeer, serverPeer, handleRequest, sendClientPeerMessage, sendServerPeerMessage } = createClientServerPeer()

  afterEach(() => {
    // ensure cleanup correctly
    expect(clientPeer.size).toBe(0)
    expect(serverPeer.size).toBe(0)
  })

  describe('client -> server', () => {
    it('throw right away if signal already aborted', async () => {
      const abortController = new AbortController()
      abortController.abort()

      await expect(clientPeer.request({
        headers: {},
        body: undefined,
        method: 'GET',
        pathname: '/',
        signal: abortController.signal,
      })).rejects.toThrow(abortController.signal.reason)

      expect(sendClientPeerMessage).toHaveBeenCalledTimes(0)
      expect(sendServerPeerMessage).toHaveBeenCalledTimes(0)
    })

    it('sync signal', async () => {
      let serverSignal!: AbortSignal

      handleRequest.mockImplementationOnce(async ({ signal }) => {
        serverSignal = signal!

        await sleep(1000)

        return {
          headers: {},
          status: 200,
          body: 'Hello',
        }
      })

      const abortController = new AbortController()
      const responsePromise = clientPeer.request({
        headers: {},
        body: undefined,
        method: 'GET',
        pathname: '/',
        signal: abortController.signal,
      })

      await sleep(10)
      expect(serverSignal.aborted).toBe(false)
      abortController.abort()
      await sleep(10)
      expect(serverSignal.aborted).toBe(true)

      await expect(responsePromise).rejects.toThrow(abortController.signal.reason)

      expect(sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'abort' }))

      expect(sendServerPeerMessage).toHaveBeenCalledTimes(0) // abort before send anything
    })

    it('stop sending event stream if aborted', async () => {
      handleRequest.mockImplementationOnce(async ({ signal }) => {
        await sleep(1000)

        return {
          headers: {},
          status: 200,
          body: 'Hello',
        }
      })

      let canceled = false
      const abortController = new AbortController()
      const responsePromise = clientPeer.request({
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
        method: 'GET',
        pathname: '/',
        signal: abortController.signal,
      })

      await sleep(10)
      abortController.abort()

      await expect(responsePromise).rejects.toThrow(abortController.signal.reason)

      await sleep(100)
      expect(canceled).toBe(true) // ensure cleanup on abort

      expect(sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'abort' }))

      expect(sendServerPeerMessage).toHaveBeenCalledTimes(0) // abort before send anything
    })

    it('stop sending octet stream if aborted', async () => {
      handleRequest.mockImplementationOnce(async ({ signal }) => {
        await sleep(1000)

        return {
          headers: {},
          status: 200,
          body: 'Hello',
        }
      })

      let cancelled = false
      const abortController = new AbortController()
      const responsePromise = clientPeer.request({
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
        method: 'GET',
        pathname: '/',
        signal: abortController.signal,
      })

      await sleep(10)
      abortController.abort()

      await expect(responsePromise).rejects.toThrow(abortController.signal.reason)

      await sleep(100)
      expect(cancelled).toBe(true) // ensure cleanup on abort

      expect(sendClientPeerMessage).toHaveBeenCalledTimes(3)
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'abort' }))

      expect(sendServerPeerMessage).toHaveBeenCalledTimes(0) // abort before send anything
    })

    it('can abort by cancel event stream response', async () => {
      let serverSignal!: AbortSignal
      let canceled = false

      handleRequest.mockImplementationOnce(async ({ signal }) => {
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

      const response = await clientPeer.request({
        headers: {},
        body: undefined,
        method: 'GET',
        pathname: '/',
      })

      expect(response.body).toSatisfy(isAsyncIteratorObject)

      await (response.body as AsyncGenerator).next()
      expect(serverSignal.aborted).toBe(false)
      await (response.body as AsyncGenerator).return(undefined)
      await sleep(10)
      expect(serverSignal.aborted).toBe(true)
      await sleep(100)
      expect(canceled).toBe(true)

      expect(sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'abort' }))

      expect(sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'event-stream' }))
    })

    it('can abort by cancel octet stream response', async () => {
      let serverSignal!: AbortSignal
      let canceled = false

      handleRequest.mockImplementationOnce(async ({ signal }) => {
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

      const response = await clientPeer.request({
        headers: {},
        body: undefined,
        method: 'GET',
        pathname: '/',
      })

      expect(response.body).toBeInstanceOf(ReadableStream)

      const reader = (response.body as ReadableStream).getReader()

      await reader.read()
      expect(serverSignal.aborted).toBe(false)
      await reader.cancel()
      await sleep(10)
      expect(serverSignal.aborted).toBe(true)
      await sleep(100)
      expect(canceled).toBe(true)

      expect(sendClientPeerMessage).toHaveBeenCalledTimes(2)
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
      expect(sendClientPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'abort' }))

      expect(sendServerPeerMessage).toHaveBeenCalledTimes(2)
      expect(sendServerPeerMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'response' }))
      expect(sendServerPeerMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'octet-stream' }))
    })
  })
})
