import type { StandardRequest, StandardResponse } from '@standardserver/core'
import type { PeerCancelMessage, PeerEventStreamMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage, PeerStreamCancelMessage } from './types'
import { AbortError, AsyncIteratorClass, isAsyncIteratorObject, sleep } from '@standardserver/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientPeer } from './client'

type ClientSendMessage = PeerCancelMessage | PeerRequestMessage | PeerEventStreamMessage | PeerOctetStreamMessage

function makeRequest(overrides: Partial<StandardRequest> = {}): StandardRequest {
  return { method: 'GET', url: '/test', headers: {}, ...overrides }
}

function makeResponseMessage(id: string, body?: unknown, headers: Record<string, string> = {}): PeerResponseMessage {
  return { id, kind: 'response', json: { status: 200, headers, body } }
}

function makeStreamingResponse(id: string, type: 'event-stream' | 'octet-stream'): PeerResponseMessage {
  return { id, kind: 'response', json: { status: 200, headers: { 'standard-server': type }, body: undefined } }
}

function makeCancelMessage(id: string): PeerCancelMessage {
  return { id, kind: 'cancel' }
}

function makeEventStreamMessage(id: string, data: unknown, event = 'message'): PeerEventStreamMessage {
  return { id, kind: 'event-stream', json: { event, data } }
}

function makeOctetStreamMessage(id: string, close: boolean, binary?: Uint8Array<ArrayBuffer>): PeerOctetStreamMessage {
  return { id, kind: 'octet-stream', json: { close }, binary }
}

function makeStreamCancelMessage(id: string): PeerStreamCancelMessage {
  return { id, kind: 'stream/cancel' }
}

function makeAsyncIter(values: unknown[]): AsyncIteratorClass<unknown> {
  let idx = 0
  return new AsyncIteratorClass<unknown>(
    async () => idx < values.length
      ? { value: values[idx++], done: false }
      : { value: undefined, done: true },
    async () => {},
  )
}

function makeHangingIter(): AsyncIteratorClass<unknown> {
  return new AsyncIteratorClass<unknown>(() => new Promise(() => {}), async () => {})
}

describe('clientPeer', () => {
  let send: ReturnType<typeof vi.fn<(msg: ClientSendMessage) => Promise<void>>>
  let peer: ClientPeer

  beforeEach(() => {
    send = vi.fn<(msg: ClientSendMessage) => Promise<void>>().mockResolvedValue(undefined)
    peer = new ClientPeer(send)
  })

  afterEach(() => {
    expect(peer.size).toBe(0)
  })

  async function waitForSend(n = 1): Promise<string> {
    await vi.waitFor(() => expect(send.mock.calls.length).toBeGreaterThanOrEqual(n))
    const requestCall = send.mock.calls.find((c: any[]) => (c[0] as any).kind === 'request')
    return (requestCall![0] as PeerRequestMessage).id
  }

  async function requestAndGetId(request?: StandardRequest): Promise<{ id: string, promise: Promise<StandardResponse> }> {
    const promise = peer.request(request ?? makeRequest())
    const id = await waitForSend()
    return { id, promise }
  }

  describe('request / response', () => {
    it('sends PeerRequestMessage and resolves on response', async () => {
      const { id, promise } = await requestAndGetId(
        makeRequest({ method: 'POST', url: '/test', headers: { 'x-custom': 'val' }, body: { data: 1 } }),
      )

      expect(send).toHaveBeenCalledTimes(1)
      const sentMsg = send.mock.calls[0]![0] as PeerRequestMessage
      expect(sentMsg).toEqual({
        id,
        kind: 'request',
        json: {
          method: 'POST',
          url: '/test',
          headers: { 'x-custom': 'val' },
          body: { data: 1 },
        },
      })

      await peer.message(makeResponseMessage(id, 'result'))
      const response = await promise
      expect(response.status).toBe(200)
      expect(response.body).toBe('result')
    })

    it('ignores response for non-existing request', async () => {
      await peer.message(makeResponseMessage('nonexist'))
    })

    it('ignores duplicate response messages', async () => {
      const { id, promise } = await requestAndGetId()
      await Promise.all([
        peer.message(makeResponseMessage(id, 'first')),
        peer.message(makeResponseMessage(id, 'second')),
      ])

      const response = await promise
      expect(response.body).toBe('first')
    })

    it('rejects when parsing invalid response', async () => {
      const { id, promise } = await requestAndGetId()

      await peer.message({
        id,
        kind: 'response',
        json: { status: 200, headers: { 'standard-server': 'form-data' }, body: undefined },
        binary: new Uint8Array([1, 2, 3]),
      })

      await expect(promise).rejects.toThrow()
    })
  })

  describe('signal / abort', () => {
    it('throws immediately if signal already aborted', async () => {
      const controller = new AbortController()
      controller.abort(new Error('pre-aborted'))

      await expect(
        peer.request(makeRequest({ signal: controller.signal })),
      ).rejects.toThrow('pre-aborted')
    })

    it('sends abort message when signal aborts after request sent', async () => {
      const controller = new AbortController()
      const promise = peer.request(makeRequest({ signal: controller.signal }))

      const id = await waitForSend()
      const error = new Error('user abort')
      controller.abort(error)

      await expect(promise).rejects.toThrow(error)
      expect(send).toHaveBeenCalledTimes(2)
      expect(send).toHaveBeenNthCalledWith(2, { id, kind: 'cancel' })
    })

    it('throws when signal aborted during send', async () => {
      const controller = new AbortController()
      send.mockImplementation(async () => {
        controller.abort(new Error('aborted during send'))
      })

      await expect(
        peer.request(makeRequest({ signal: controller.signal })),
      ).rejects.toThrow('aborted during send')

      expect(send).toHaveBeenCalledTimes(2)
      const id = (send.mock.calls[0]![0] as PeerRequestMessage).id
      expect(send).toHaveBeenNthCalledWith(2, { id, kind: 'cancel' })
    })

    it('rejects when send throws', async () => {
      const error = new Error('send failed')
      send.mockRejectedValueOnce(error)
      await expect(peer.request(makeRequest())).rejects.toThrow(error)
    })

    it('rejects pending request on server abort', async () => {
      const { id, promise } = await requestAndGetId()
      await peer.message(makeCancelMessage(id))
      await expect(promise).rejects.toThrow(AbortError)
    })
  })

  describe('event stream', () => {
    describe('request body (outgoing)', () => {
      it('transmits event-stream request body', async () => {
        const iter = makeAsyncIter(['a'])
        const promise = peer.request(
          makeRequest({ method: 'POST', headers: {}, body: iter }),
        )

        const id = await waitForSend()
        await vi.waitFor(() => {
          expect(send).toHaveBeenCalledTimes(3)
          expect(send).toHaveBeenNthCalledWith(1, { id, kind: 'request', json: expect.objectContaining({ headers: { 'standard-server': 'event-stream' } }) })
          expect(send).toHaveBeenNthCalledWith(2, { id, kind: 'event-stream', json: { event: 'message', data: 'a' } })
          expect(send).toHaveBeenNthCalledWith(3, { id, kind: 'event-stream', json: { event: 'close' } })
        })

        await peer.message(makeResponseMessage(id))
        await promise
      })

      it('cancels iterator on stream/cancel message', async () => {
        const iter = makeHangingIter()
        const returnSpy = vi.spyOn(iter, 'return')

        const { id, promise } = await requestAndGetId(
          makeRequest({ method: 'POST', headers: { 'standard-server': 'event-stream' }, body: iter }),
        )

        await peer.message(makeStreamCancelMessage(id))
        expect(returnSpy).toHaveBeenCalled()

        await peer.message(makeResponseMessage(id))
        await promise
      })

      it('reject and send abort on non-protocol error', async () => {
        const nonProtocolError = new Error('non-protocol error')
        const iter = new AsyncIteratorClass<unknown>(async () => {
          sleep(100)
          throw nonProtocolError
        }, async () => {})

        const promise = expect(
          peer.request(
            makeRequest({ method: 'POST', headers: { 'standard-server': 'event-stream' }, body: iter }),
          ),
        ).rejects.toThrow(nonProtocolError)

        await promise
        expect(send).toHaveBeenCalledTimes(2)
        expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
        expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'cancel' }))
      })

      it('does not send abort on non-protocol error if stream was canceled', async () => {
        const nonProtocolError = new Error('non-protocol error')
        const iter = new AsyncIteratorClass<unknown>(async () => {
          await sleep(100)
          throw nonProtocolError
        }, async () => {})

        const promise = expect(
          peer.request(
            makeRequest({ method: 'POST', headers: { 'standard-server': 'event-stream' }, body: iter }),
          ),
        ).rejects.toThrow(nonProtocolError)

        const id = await waitForSend()
        await peer.message(makeStreamCancelMessage(id))

        console.log(await promise)
        expect(send).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
        expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'cancel' }))
      })
    })

    describe('response body (incoming)', () => {
      it('creates iterator from event-stream response', async () => {
        const { id, promise } = await requestAndGetId()
        await peer.message(makeStreamingResponse(id, 'event-stream'))

        const response = await promise
        const iter = response.body as AsyncIterator<unknown>
        expect(iter).toSatisfy(isAsyncIteratorObject)

        await peer.message(makeEventStreamMessage(id, 'evt1'))
        const result = await iter.next()
        expect(result.value).toBe('evt1')
        expect(result.done).toBe(false)

        await peer.message(makeEventStreamMessage(id, 'bye', 'close'))
        const closeResult = await iter.next()
        expect(closeResult.done).toBe(true)
      })

      it('abort request when canceling iterator', async () => {
        const { id, promise } = await requestAndGetId()
        await peer.message(makeStreamingResponse(id, 'event-stream'))

        const response = await promise
        await peer.message(makeEventStreamMessage(id, 42))

        const iter = response.body as AsyncIterator<unknown>
        const result = await iter.next()
        expect(result.value).toBe(42)

        await iter.return?.()

        expect(send).toHaveBeenCalledTimes(2)
        expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
        expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'cancel' }))
      })
    })
  })

  describe('octet stream', () => {
    describe('request body (outgoing)', () => {
      it('transmits octet-stream request body', async () => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]))
            controller.close()
          },
        })

        const promise = peer.request(
          makeRequest({ method: 'POST', headers: { 'standard-server': 'octet-stream' }, body: stream }),
        )

        const id = await waitForSend()
        await peer.message(makeResponseMessage(id))
        await promise

        expect(send).toHaveBeenCalledTimes(3)
        expect(send).toHaveBeenNthCalledWith(1, { id, kind: 'request', json: expect.objectContaining({ headers: { 'standard-server': 'octet-stream' } }) })
        expect(send).toHaveBeenNthCalledWith(2, { id, kind: 'octet-stream', json: { close: false }, binary: new Uint8Array([1, 2]) })
        expect(send).toHaveBeenNthCalledWith(3, { id, kind: 'octet-stream', json: { close: true }, binary: undefined })
      })

      it('cancels transmitter on stream/cancel message', async () => {
        const cancel = vi.fn()
        const stream = new ReadableStream<Uint8Array>({
          start() { /* hangs */ },
          cancel,
        })

        const { id, promise } = await requestAndGetId(
          makeRequest({ method: 'POST', headers: { 'standard-server': 'octet-stream' }, body: stream }),
        )

        await peer.message(makeStreamCancelMessage(id))
        await peer.message(makeResponseMessage(id))
        await promise

        expect(cancel).toHaveBeenCalled()
      })

      it('reject and send abort on stream error', async () => {
        const error = new Error('stream error')
        const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
          async start(controller) {
            await sleep(100)
            controller.error(error)
          },
        })

        const promise = expect(
          peer.request(
            makeRequest({ method: 'POST', headers: { 'standard-server': 'octet-stream' }, body: stream }),
          ),
        ).rejects.toThrow(error)

        await promise
        expect(send).toHaveBeenCalledTimes(2)
        expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
        expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'cancel' }))
      })

      it('does not send abort on error if stream was canceled', async () => {
        const stream = new ReadableStream<Uint8Array>({
          start() { /* hangs */ },
        })

        const promise = peer.request(
          makeRequest({ method: 'POST', headers: { 'standard-server': 'octet-stream' }, body: stream }),
        )

        const id = await waitForSend()
        await peer.message(makeStreamCancelMessage(id))

        expect(send).toHaveBeenCalledTimes(1)

        expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'cancel' }))

        await peer.message(makeResponseMessage(id))
        await promise
      })
    })

    describe('response body (incoming)', () => {
      it('creates ReadableStream from octet-stream response', async () => {
        const { id, promise } = await requestAndGetId()
        await peer.message(makeStreamingResponse(id, 'octet-stream'))

        const response = await promise
        expect(response.body).toBeInstanceOf(ReadableStream)

        const reader = (response.body as ReadableStream).getReader()

        await peer.message(makeOctetStreamMessage(id, false, new Uint8Array([5, 6])))
        const { value } = await reader.read()
        expect(value).toEqual(new Uint8Array([5, 6]))

        await peer.message(makeOctetStreamMessage(id, true))
        const { done } = await reader.read()
        expect(done).toBe(true)
      })
    })
  })

  describe('close', () => {
    it('rejects all pending requests', async () => {
      const p1 = peer.request(makeRequest({ url: '/a' }))
      const p2 = peer.request(makeRequest({ url: '/b' }))
      await vi.waitFor(() => expect(send.mock.calls.length).toBeGreaterThanOrEqual(2))

      await peer.close()

      await expect(p1).rejects.toThrow(AbortError)
      await expect(p2).rejects.toThrow(AbortError)
    })

    it('uses custom reason when provided', async () => {
      const { promise } = await requestAndGetId()
      await peer.close(new Error('custom'))
      await expect(promise).rejects.toThrow('custom')
    })

    it('terminates active event-stream response iteration', async () => {
      const { id, promise } = await requestAndGetId()
      await peer.message(makeStreamingResponse(id, 'event-stream'))
      const response = await promise

      const iter = response.body as AsyncIterator<unknown>
      const nextPromise = iter.next()

      await peer.close()

      await expect(nextPromise).rejects.toThrow(AbortError)
    })

    it('terminates active octet-stream response reading', async () => {
      const { id, promise } = await requestAndGetId()
      await peer.message(makeStreamingResponse(id, 'octet-stream'))
      const response = await promise

      const reader = (response.body as ReadableStream).getReader()
      const readPromise = reader.read()

      await peer.close()

      await expect(readPromise).rejects.toThrow(AbortError)
    })

    it('tolerates iter.return() called after close', async () => {
      const { id, promise } = await requestAndGetId()
      await peer.message(makeStreamingResponse(id, 'event-stream'))
      const response = await promise

      const iter = response.body as AsyncIterator<unknown>
      await peer.close()

      // does not send abort message for already closed request
      await iter.return?.()

      expect(send).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'request' }))
    })
  })
})
