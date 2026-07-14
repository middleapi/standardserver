import type { PeerMessage } from '@standardserver/peer'
import { decodePeerMessage, encodePeerMessage } from '@standardserver/peer'
import { bench, describe } from 'vitest'

const jsonMessage: PeerMessage = {
  id: 'req-0001',
  kind: 'request',
  json: {
    method: 'POST',
    url: '/api/v1/resource?page=1&limit=20',
    headers: {
      'content-type': 'application/json',
      'accept': ['application/json', 'text/plain'],
    },
    body: {
      name: 'standard-server',
      values: Array.from({ length: 32 }, (_, i) => ({ index: i, label: `item-${i}` })),
    },
  },
}

const binaryPayload = new Uint8Array(4096)
for (let i = 0; i < binaryPayload.length; i++) {
  binaryPayload[i] = i % 251
}

const binaryMessage: PeerMessage = {
  id: 'req-0002',
  kind: 'octet-stream',
  json: { url: '/upload' },
  binary: binaryPayload,
}

const encodedJson = await encodePeerMessage(jsonMessage) as string
const encodedBinary = await encodePeerMessage(binaryMessage) as Uint8Array<ArrayBuffer>
const encodedPrefixed = await encodePeerMessage(binaryMessage, { prefix: 'ss:' }) as Uint8Array<ArrayBuffer>

describe('peer / encode', () => {
  bench('encodePeerMessage - json only', async () => {
    await encodePeerMessage(jsonMessage)
  })

  bench('encodePeerMessage - json + binary', async () => {
    await encodePeerMessage(binaryMessage)
  })

  bench('encodePeerMessage - with prefix', async () => {
    await encodePeerMessage(binaryMessage, { prefix: 'ss:' })
  })
})

describe('peer / decode', () => {
  bench('decodePeerMessage - json only', () => {
    decodePeerMessage(encodedJson)
  })

  bench('decodePeerMessage - json + binary', () => {
    decodePeerMessage(encodedBinary)
  })

  bench('decodePeerMessage - with prefix', () => {
    decodePeerMessage(encodedPrefixed, { prefix: 'ss:' })
  })
})
