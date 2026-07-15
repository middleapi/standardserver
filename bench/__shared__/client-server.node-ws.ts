/* eslint-disable ban/ban */
import type { PeerMessage } from '@standardserver/peer'
import type { BlobPart } from 'node:buffer'
import type { ClientServer } from './client-server'
import { ClientPeer, decodePeerMessage, encodePeerMessage, isClientPeerSendMessage, isServerPeerSendMessage, ServerPeer } from '@standardserver/peer'
import { WebSocket, WebSocketServer } from 'ws'

const prefix = 'bench:'

async function encode(message: PeerMessage) {
  return encodePeerMessage(message, { prefix })
}

async function normalizeWsData(data: unknown): Promise<string | Uint8Array<ArrayBuffer>> {
  if (typeof data === 'string') {
    return data
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }

  if (Array.isArray(data)) {
    return await new Blob(data as BlobPart[]).bytes() as Uint8Array<ArrayBuffer>
  }

  if (data instanceof Uint8Array) {
    return new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
  }

  // Node.js Buffer
  const buffer = data as { buffer: ArrayBuffer, byteOffset: number, byteLength: number }
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

/**
 * Peer adapter over a real WebSocket server/client (`ws`).
 */
export function createNodeWsClientServer(): ClientServer {
  const wss = new WebSocketServer({ port: 0 })
  const address = wss.address() as WebSocket.AddressInfo
  const wsc = new WebSocket(`ws://localhost:${address.port}`)

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

  const clientPeer = new ClientPeer(async (message) => {
    await untilReady
    wsc.send(await encode(message))
  })

  wsc.addEventListener('message', async (event) => {
    const encoded = await normalizeWsData(event.data)
    const { matched, message } = decodePeerMessage(encoded, { prefix })

    if (!matched || !isServerPeerSendMessage(message)) {
      return
    }

    await clientPeer.message(message)
  })

  const clientServer: ClientServer = {
    handler: async () => ({ status: 404, body: 'Not Found', headers: {} }),
    request: async (standardRequest) => {
      await untilReady
      return clientPeer.request(standardRequest)
    },
  }

  let sendServer: (data: string | Uint8Array) => void = () => {
    throw new Error('websocket server not connected')
  }

  const serverPeer = new ServerPeer(async (message) => {
    sendServer(await encode(message) as string | Uint8Array)
  })

  wss.on('connection', (ws) => {
    sendServer = (data) => {
      ws.send(data)
    }

    ws.addEventListener('message', async (event) => {
      const encoded = await normalizeWsData(event.data)
      const { matched, message } = decodePeerMessage(encoded, { prefix })

      if (!matched || !isClientPeerSendMessage(message)) {
        return
      }

      await serverPeer.message(message, async request => clientServer.handler(request))
    })
  })

  return clientServer
}
