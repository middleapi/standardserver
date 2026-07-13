import type { PeerMessage } from '@standardserver/peer'
import type { ClientServerTest } from './client-server'
import { toFetchBody, toFetchHeaders, toStandardBody } from '@standardserver/fetch'
import { ClientPeer, decodePeerMessage, encodePeerMessage, isClientPeerSendMessage, isServerPeerSendMessage, ServerPeer } from '@standardserver/peer'

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
 * fetch adapters over a MessageChannel connection.
 *
 * This setup exercises mixed streaming and custom body handling to verify that
 * peer-based request/response messaging can interoperate with fetch-compatible
 * request and response bodies.
 */
export function createMessagePortFetchStreamedClientServerTest(): ClientServerTest {
  const { port1, port2 } = new MessageChannel()

  const sendClientPeerMessage: ClientServerTest['sendClientPeerMessage'] = vi.fn(async (message) => {
    port1.postMessage(await randomEncodePeerMessage(message))
  })
  const clientPeer = new ClientPeer(sendClientPeerMessage)
  port1.addEventListener('message', async (event) => {
    const { matched, message } = decodePeerMessage(event.data, { prefix })

    if (!matched || !isServerPeerSendMessage(message)) {
      return
    }

    await clientPeer.message(message)
  })
  port1.start()

  const handler: ClientServerTest['handler'] = vi.fn(async () => {
    return { status: 404, body: 'Not Found', headers: {} }
  })
  const sendServerPeerMessage: ClientServerTest['sendServerPeerMessage'] = vi.fn(async (message) => {
    port2.postMessage(await randomEncodePeerMessage(message))
  })
  const serverPeer = new ServerPeer(sendServerPeerMessage)
  port2.addEventListener('message', async (event) => {
    const { matched, message } = decodePeerMessage(event.data, { prefix })

    if (!matched || !isClientPeerSendMessage(message)) {
      return
    }

    await serverPeer.message(message, async (request) => {
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
  port2.start()

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
