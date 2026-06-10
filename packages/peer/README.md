# @standardserver/peer

<div align="center">
  <a href="https://codecov.io/gh/middleapi/standardserver">
    <img alt="codecov" src="https://codecov.io/gh/middleapi/standardserver/branch/main/graph/badge.svg">
  </a>
  <a href="https://www.npmjs.com/package/@standardserver/peer">
    <img alt="weekly downloads" src="https://img.shields.io/npm/dw/%40standardserver%2Fpeer?logo=npm" />
  </a>
  <a href="https://github.com/middleapi/standardserver/blob/main/LICENSE">
    <img alt="MIT License" src="https://img.shields.io/github/license/middleapi/standardserver?logo=open-source-initiative" />
  </a>
  <a href="https://discord.gg/TXEbwRBvQn">
    <img alt="Discord" src="https://img.shields.io/discord/1308966753044398161?color=7389D8&label&logo=discord&logoColor=ffffff" />
  </a>
  <a href="https://deepwiki.com/middleapi/standardserver">
    <img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki">
  </a>
</div>

`@standardserver/peer` adapts message-based transports to the transport-agnostic request and response model defined by Standard Server.

Standard Server provides a unified interface for client-server communication across HTTP and message-based transports. It lets you write handlers and clients against the same request, response, body, and streaming primitives whether the underlying transport is Fetch, Node.js HTTP, WebSocket, MessagePort, or another peer-style channel.

This package is the peer adapter for that model. It converts between Standard Server requests and responses and a structured peer message protocol that can be sent through any transport capable of carrying strings or binary data.

## Entry Point

The package exports a single entry point:

| Export                 | Purpose                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `@standardserver/peer` | Peer adapter helpers for requests, responses, codecs, streams, and validators |

## Package overview

The main entry point exposes four groups of helpers:

| Group                | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Purpose                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Peer runtime         | `ClientPeer`, `ServerPeer`                                                                                                                                                                                                                                                                                                                                                                                                                                             | Send Standard Server requests and responses over a peer transport |
| Message codec        | `encodePeerMessage()`, `decodePeerMessage()`                                                                                                                                                                                                                                                                                                                                                                                                                           | Encode peer messages as strings or bytes for transport            |
| Stream utilities     | `toEventIterator()`, `EventStreamTransmitter`, `HibernationEventIterator`                                                                                                                                                                                                                                                                                                                                                                                              | Bridge peer messages with Standard Server event-stream semantics  |
| Types and validators | `PeerMessage`, `PeerRequestMessage`, `PeerResponseMessage`, `PeerCancelMessage`, `PeerEventStreamMessage`, `PeerOctetStreamMessage`, `PeerStreamCancelMessage`, `ClientPeerSendMessage`, `ServerPeerSendMessage`, `isPeerMessage()`, `isPeerRequestMessage()`, `isPeerResponseMessage()`, `isPeerCancelMessage()`, `isPeerEventStreamMessage()`, `isPeerOctetStreamMessage()`, `isPeerStreamCancelMessage()`, `isClientPeerSendMessage()`, `isServerPeerSendMessage()` | Describe and validate the peer protocol payloads                  |

Use these helpers when you want Standard Server handlers or clients to run over message-based transports such as `MessagePort`, WebSocket, Electron IPC, or a custom channel.

## Request and response flow

`ClientPeer` starts a request and waits for a `StandardLazyResponse`. `ServerPeer` receives peer messages, reconstructs a `StandardLazyRequest`, calls your handler, and sends the resulting `StandardResponse` back over the same transport.

```ts
import type { StandardLazyRequest, StandardResponse } from '@standardserver/core'
import {
  ClientPeer,
  decodePeerMessage,
  encodePeerMessage,
  isClientPeerSendMessage,
  isServerPeerSendMessage,
  ServerPeer,
} from '@standardserver/peer'

async function handle(request: StandardLazyRequest): Promise<StandardResponse> {
  const body = await request.resolveBody()

  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: {
      ok: true,
      method: request.method,
      url: request.url,
      received: body,
    },
  }
}

const { port1, port2 } = new MessageChannel()

const clientPeer = new ClientPeer(async (message) => {
  port1.postMessage(await encodePeerMessage(message, { /** options */ }))
})

const serverPeer = new ServerPeer(async (message) => {
  port2.postMessage(await encodePeerMessage(message, { /** options */ }))
})

port1.addEventListener('message', async (event) => {
  const decoded = decodePeerMessage(event.data, { /** options */ })

  if (decoded.matched && isServerPeerSendMessage(decoded.message)) {
    await clientPeer.message(decoded.message)
  }
})

port2.addEventListener('message', async (event) => {
  const decoded = decodePeerMessage(event.data, { /** options */ })

  if (decoded.matched && isClientPeerSendMessage(decoded.message)) {
    await serverPeer.message(decoded.message, handle)
  }
})

port1.start()
port2.start()

const response = await clientPeer.request({
  method: 'POST',
  url: '/echo',
  headers: { 'content-type': 'application/json' },
  body: { message: 'hello' },
})

const payload = await response.resolveBody()
```

> [!TIP]
> When encoding or decoding peer messages, you can pass additional options, such as `prefix`, to prevent collisions when the same peer is used for multiple purposes.

## Codec helpers

Use `encodePeerMessage()` and `decodePeerMessage()` to bridge between the peer protocol and your underlying transport.

```ts
import { decodePeerMessage, encodePeerMessage } from '@standardserver/peer'

const encoded = await encodePeerMessage(
  {
    id: '1',
    kind: 'request',
    json: { method: 'GET', url: '/health', headers: {}, body: undefined },
  },
  { prefix: 'rpc:' },
)

const decoded = decodePeerMessage(encoded, { prefix: 'rpc:' })

if (decoded.matched) {
  console.log(decoded.message.kind)
}
```

Encoding rules:

1. Messages without binary payloads are encoded as strings.
2. Messages with binary payloads are encoded as `Uint8Array` values containing JSON, a delimiter byte, and the raw binary bytes.
3. The optional `prefix` lets you share the same transport between multiple protocols without collisions.

## Learn more

For the higher-level project overview, see the root [Standard Server README](../../README.md).

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/middleapi/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/middleapi/static/sponsors.svg' alt="Sponsors"/>
  </a>
</p>
