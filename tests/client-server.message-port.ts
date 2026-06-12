import type { PeerMessage } from '@standardserver/peer'
import type { ClientServerTest } from './client-server'
import { ClientPeer, decodePeerMessage, encodePeerMessage, ServerPeer } from '@standardserver/peer'

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

export function createMessagePortClientServerTest(): ClientServerTest {
  const { port1, port2 } = new MessageChannel()

  const sendClientPeerMessage: ClientServerTest['sendClientPeerMessage'] = vi.fn(async (message) => {
    port1.postMessage(await randomEncodePeerMessage(message))
  })
  const clientPeer = new ClientPeer(sendClientPeerMessage)
  port1.addEventListener('message', async (event) => {
    try {
      const { matched, message } = decodePeerMessage(event.data, { prefix })

      if (!matched) {
        return
      }

      await clientPeer.message(message as any)
    }
    catch (e) {
      console.error(e)
    }
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

    if (!matched) {
      return
    }

    await serverPeer.message(message as any, async (request) => {
      return handler(request)
    })
  })
  port2.start()

  const request: ClientServerTest['request'] = vi.fn(async (standardRequest) => {
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
    sendClientPeerMessage,
    sendServerPeerMessage,
  }
}
