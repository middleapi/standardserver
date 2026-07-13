/* eslint-disable ban/ban */
import type { PeerMessage } from '@standardserver/peer'
import type { BlobPart } from 'node:buffer'
import type { ClientServerTest } from './client-server'
import { toFetchBody, toFetchHeaders, toStandardBody } from '@standardserver/fetch'
import { ClientPeer, decodePeerMessage, encodePeerMessage, ServerPeer } from '@standardserver/peer'
import { WebSocket, WebSocketServer } from 'ws'

const prefix = '__PREFIX__'

async function randomEncodePeerMessage(message: PeerMessage) {
  let encoded = await encodePeerMessage(message, { prefix })

  /**
   * In some env when you send string but on server you might receive buffer,
   * so this is to increase coverage
   */
  if (typeof encoded === 'string' && Math.random() < 0.5) {
    encoded = new TextEncoder().encode(encoded)
  }

  return encoded
}

/**
 * Creates a client/server test harness that bridges the peer transport with the
 * fetch adapters over a Node.js WebSocket connection.
 *
 * This setup exercises mixed streaming and custom body handling to verify that
 * peer-based request/response messaging can interoperate with fetch-compatible
 * request and response bodies.
 */
export function createNodeWsFetchStreamedClientServerTest(): ClientServerTest {
  const wss = new WebSocketServer({ port: 0 })
  const port = wss.address() as WebSocket.AddressInfo
  const wsc = new WebSocket(`ws://localhost:${port.port}`)

  afterAll(() => {
    wss.close()
    wsc.close()
  })

  const untilReady = new Promise<void>((resolve) => {
    if (wsc.readyState === WebSocket.OPEN) {
      resolve()
      return
    }

    wsc.addEventListener('open', () => {
      resolve()
    })
  })

  const sendClientPeerMessage: ClientServerTest['sendClientPeerMessage'] = vi.fn(async (message) => {
    await untilReady
    wsc.send(await randomEncodePeerMessage(message))
  })
  const clientPeer = new ClientPeer(sendClientPeerMessage)
  wsc.addEventListener('message', async (event) => {
    const encoded = typeof event.data === 'string'
      ? event.data
      : event.data instanceof ArrayBuffer
        ? new Uint8Array(event.data)
        : Array.isArray(event.data)
          ? await (new Blob(event.data as BlobPart[])).bytes()
          : new Uint8Array(event.data.buffer as ArrayBuffer, event.data.byteOffset, event.data.byteLength)

    const { matched, message } = decodePeerMessage(encoded, { prefix })

    if (!matched) {
      return
    }

    await clientPeer.message(message as any)
  })

  const handler: ClientServerTest['handler'] = vi.fn(async () => {
    return { status: 404, body: 'Not Found', headers: {} }
  })

  let sendServerPeerInternal: (message: any) => void
  const sendServerPeerMessage: ClientServerTest['sendServerPeerMessage'] = vi.fn(async (message) => {
    sendServerPeerInternal(await randomEncodePeerMessage(message))
  })
  const serverPeer = new ServerPeer(sendServerPeerMessage)

  wss.on('connection', (ws) => {
    sendServerPeerInternal = ws.send.bind(ws)

    ws.addEventListener('message', async (event) => {
      const encoded = typeof event.data === 'string'
        ? event.data
        : event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : Array.isArray(event.data)
            ? await (new Blob(event.data as BlobPart[])).bytes()
            : new Uint8Array(event.data.buffer as ArrayBuffer, event.data.byteOffset, event.data.byteLength)

      const { matched, message } = decodePeerMessage(encoded, { prefix })

      if (!matched) {
        return
      }

      await serverPeer.message(message as any, async (request) => {
        return handler({
          ...request,
          resolveBody: async (hint) => {
            // peer adapter does not support body-hint, but I still put it there :V
            const stream = await request.resolveBody('octet-stream')

            if (stream instanceof ReadableStream) {
              const body = await toStandardBody(new Response(stream, { headers: toFetchHeaders(request.headers) }), { hint })
              return body
            }

            return stream
          },
        })
      })
    })
  })

  const request: ClientServerTest['request'] = vi.fn(async (standardRequest) => {
    const [body, headers] = toFetchBody(standardRequest.body, standardRequest.headers)
    const res = new Response(body)

    standardRequest = {
      ...standardRequest,
      body: res.body ?? undefined,
      headers: {
        ...headers,
        'content-type': headers['content-type'] ?? res.headers.get('content-type') ?? undefined,
      },
    }

    const response = await clientPeer.request(standardRequest)
    return response
  })

  afterEach(() => {
    // ensure all resource is cleaned up correctly
    expect((clientPeer as any).requests.size).toBe(0)
    expect((serverPeer as any).requests.size).toBe(0)
  })

  return {
    handler,
    request,
  }
}
