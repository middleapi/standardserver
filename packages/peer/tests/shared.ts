import type { StandardRequest, StandardResponse } from '@standardserver/core'
import type { PeerAbortMessage, PeerEventStreamMessage, PeerMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage } from '../src'
import { ClientPeer, decodePeerMessage, encodePeerMessage, ServerPeer } from '../src'

async function randomEncodePeerMessage(message: PeerMessage) {
  let encoded = await encodePeerMessage(message)

  /**
   * In some env when you send string but on server you might receive buffer,
   * so this is to increase coverage
   */
  if (typeof encoded === 'string' && Math.random() < 0.5) {
    encoded = new TextEncoder().encode(encoded)
  }

  return encoded
}

export function createClientServerPeer() {
  const handleRequest = vi.fn(async (_req: StandardRequest): Promise<StandardResponse> => {
    return {
      headers: {},
      status: 404,
      body: 'Not found',
    }
  })

  // use message ports to simulate production environment
  const { port1, port2 } = new MessageChannel()

  port1.start()
  port2.start()

  const sendClientPeerMessage = vi.fn(async (message: PeerRequestMessage | PeerAbortMessage | PeerEventStreamMessage | PeerOctetStreamMessage) => {
    port1.postMessage(await randomEncodePeerMessage(message))
  })
  const clientPeer = new ClientPeer(sendClientPeerMessage)
  port1.addEventListener('message', async (event) => {
    await clientPeer.message(decodePeerMessage(event.data) as any)
  })

  const sendServerPeerMessage = vi.fn(async (message: PeerResponseMessage | PeerAbortMessage | PeerEventStreamMessage | PeerOctetStreamMessage) => {
    port2.postMessage(await randomEncodePeerMessage(message))
  })
  const serverPeer = new ServerPeer(sendServerPeerMessage)
  port2.addEventListener('message', async (event) => {
    await serverPeer.message(decodePeerMessage(event.data) as any, handleRequest)
  })

  return {
    clientPeer,
    serverPeer,
    handleRequest,
    sendClientPeerMessage,
    sendServerPeerMessage,
  }
}
