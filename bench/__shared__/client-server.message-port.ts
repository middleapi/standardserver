import type { PeerMessage } from '@standardserver/peer'
import type { ClientServer } from './client-server'
import { ClientPeer, decodePeerMessage, encodePeerMessage, isClientPeerSendMessage, isServerPeerSendMessage, ServerPeer } from '@standardserver/peer'

const prefix = 'bench:'

async function encode(message: PeerMessage) {
  return encodePeerMessage(message, { prefix })
}

/**
 * Peer adapter over `MessageChannel` (in-process, no network).
 */
export function createMessagePortClientServer(): ClientServer {
  const { port1, port2 } = new MessageChannel()

  const clientPeer = new ClientPeer(async (message) => {
    port1.postMessage(await encode(message))
  })

  port1.addEventListener('message', async (event) => {
    const { matched, message } = decodePeerMessage(event.data, { prefix })

    if (!matched || !isServerPeerSendMessage(message)) {
      return
    }

    await clientPeer.message(message)
  })
  port1.start()

  const clientServer: ClientServer = {
    handler: async () => ({ status: 404, body: 'Not Found', headers: {} }),
    request: async standardRequest => clientPeer.request(standardRequest),
  }

  const serverPeer = new ServerPeer(async (message) => {
    port2.postMessage(await encode(message))
  })

  port2.addEventListener('message', async (event) => {
    const { matched, message } = decodePeerMessage(event.data, { prefix })

    if (!matched || !isClientPeerSendMessage(message)) {
      return
    }

    await serverPeer.message(message, async request => clientServer.handler(request))
  })
  port2.start()

  afterAll(() => {
    port1.close()
    port2.close()
  })

  return clientServer
}
