# Standard Server

<div align="center">
  <a href="https://codecov.io/gh/middleapi/standardserver">
    <img alt="codecov" src="https://codecov.io/gh/middleapi/standardserver/branch/main/graph/badge.svg">
  </a>
  <a href="https://www.npmjs.com/package/@standardserver/core">
    <img alt="weekly downloads" src="https://img.shields.io/npm/dw/%40standardserver%2Fcore?logo=npm" />
  </a>
  <a href="https://app.codspeed.io/middleapi/standardserver?utm_source=badge">
    <img src="https://img.shields.io/endpoint?url=https://codspeed.io/badge.json" alt="CodSpeed" />
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

**Standard Server** provides a unified interface for client-server communication over HTTP and message-based transports.

```ts
import type { StandardLazyRequest, StandardResponse, } from '@standardserver/core'

export async function handle(request: StandardLazyRequest): Promise<StandardResponse> {
  const body = await request.resolveBody()

  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    async* body() { // <- SSE response
      yield 'Hello, World!'
    },
  }
}
```

## Why Standard Server?

Standard Server abstracts away the complexities of handling different communication protocols, allowing developers to focus on building their applications without worrying about the underlying transport mechanisms. It supports both HTTP and message-based transports, making it versatile for various use cases.

## Packages

| Package                      | Purpose                                 | Main entry points                                                                                     |
| ---------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@standardserver/aws-lambda` | AWS Lambda adapter (response streaming) | `toStandardLazyRequest`, `sendStandardResponse`                                                       |
| `@standardserver/core`       | Shared types, validators, and utilities | `StandardRequest`, `StandardLazyRequest`, `StandardResponse`, `StandardLazyResponse`                  |
| `@standardserver/fastify`    | Fastify adapter                         | `toStandardLazyRequest`, `sendStandardResponse`                                                       |
| `@standardserver/fetch`      | Fetch API adapter                       | `toStandardLazyRequest`, `toFetchResponse`, `toStandardLazyResponse`, `toFetchBody`, `toFetchHeaders` |
| `@standardserver/node`       | Node.js HTTP/HTTP2 adapter              | `toStandardLazyRequest`, `sendStandardResponse`                                                       |
| `@standardserver/peer`       | Message-based adapter                   | `ClientPeer`, `ServerPeer`, `encodePeerMessage`, `decodePeerMessage`                                  |

## Standard Request and Response

Standard Server defines four core types: `StandardRequest`, `StandardLazyRequest`, `StandardResponse`, and `StandardLazyResponse`. Together, they provide a consistent shape for transport-agnostic communication.

| Field                | Type                                                 | Description                                       |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| `method`             | `string`                                             | HTTP method (e.g., GET, POST)                     |
| `url`                | `string`                                             | request URL not include origin and start with `/` |
| `headers`            | `Record<string, string \| string[] \| undefined>`    | request headers as a lowercase-key-value pair     |
| `body`               | `StandardBody`                                       | parsed body                                       |
| `resolveBody(hint?)` | `(hint?: StandardBodyHint) => Promise<StandardBody>` | Lazily resolves the request body                  |
| `status`             | `number`                                             | HTTP status code (e.g., 200, 404)                 |
| `signal`             | `undefined \| AbortSignal`                           | signal related to request/response lifecycle      |

### Standard Body

Currently, `StandardBody` and `StandardBodyHint` can be one of the following types:

| Type                         | Hint           | Description                | Content-Type                        |
| ---------------------------- | -------------- | -------------------------- | ----------------------------------- |
| `unknown`                    | `json`         | JSON-compatible value      | `application/json`                  |
| `FormData`                   | `form-data`    | Multipart form submissions | `multipart/form-data`               |
| `URLSearchParams`            | `url-encoded`  | URL-encoded forms          | `application/x-www-form-urlencoded` |
| `AsyncIteratorObject`        | `event-stream` | Server-Sent Events (SSE)   | `text/event-stream`                 |
| `ReadableStream<Uint8Array>` | `octet-stream` | Binary streaming           | any                                 |
| `Blob` or `File`             | `file`         | Fixed-size binary payload  | any                                 |
| `undefined`                  | `none`         | Empty body                 |                                     |

### Resolving Body

`resolveBody(hint?)` determines how to parse the body using the following priority:

1. If `hint?` is provided, use it as the `StandardBodyHint`.
2. Otherwise, if the `standard-server` header is present, use it as the `StandardBodyHint`.
3. Otherwise, if `content-type` is one of the common types, parse accordingly.
4. Otherwise, if `content-length` exists, treat the body as `file`; if not, treat it as `octet-stream`.

For efficient communication, set the `standard-server` header to explicitly hint the body type, especially for file or binary streaming. For example, if you upload a file with a common `content-type` such as `application/json` but omit the `standard-server` header, the server may interpret it as JSON and parse it unexpectedly.

```ts
const response = await fetch('/upload', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'standard-server': 'file', // <- hint the body type to avoid misinterpretation
  },
  body: new Blob(['{"message": "Hello, world!"}'], { type: 'application/json' }),
})
```

### JSON Body

Standard Server treats primitive values, objects, and arrays as JSON.

```ts
import { StandardRequest } from '@standardserver/core'

const request: StandardRequest = {
  method: 'POST',
  url: '/submit',
  headers: {},
  body: { name: 'John Doe', email: 'john.doe@example.com' },
}
```

### FormData and URLSearchParams Body

Standard Server treats [FormData](https://developer.mozilla.org/en-US/docs/Web/API/FormData) and [URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) as form submissions.

```ts
import { StandardRequest } from '@standardserver/core'

const requestWithURLSearchParams: StandardRequest = {
  method: 'POST',
  url: '/submit',
  headers: {},
  body: new URLSearchParams({ name: 'John Doe', email: 'john.doe@example.com' }),
}

const formData = new FormData()
formData.append('name', 'John Doe')
formData.append('file', new Blob(['Hello, World!'], { type: 'text/plain' }), 'hello.txt')

const requestWithFormData: StandardRequest = {
  method: 'POST',
  url: '/submit',
  headers: {},
  body: formData,
}
```

> [!TIP]
> HTML forms submit data as `application/x-www-form-urlencoded` or `multipart/form-data`, so this is especially helpful here.

## File and Blob Body

Standard Server treats [File](https://developer.mozilla.org/en-US/docs/Web/API/File) and [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob) as fixed-size binary payloads.

> [!NOTE]
> Since `File` extends `Blob`, `resolveBody` always returns a `File` when representing either `File` or `Blob` bodies.

```ts
import { StandardResponse } from '@standardserver/core'

const response: StandardResponse = {
  status: 200,
  headers: {
    'content-disposition': [], // <- remove auto-set header
  },
  body: new File(['Hello, World!'], 'hello.txt', { type: 'text/plain' }),
}
```

When sending a file or blob body, Standard Server automatically sets the `content-length`, `content-type`, `content-disposition`, and `standard-server` headers based on the provided body. You can override `content-disposition` by explicitly providing a header value, or remove it entirely by assigning an empty array.

### Event-Stream Body

Standard Server uses [AsyncIteratorObject](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncIterator) to represent an event stream body, and you can use `withEventMeta` to attach additional [SSE event metadata](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format) to each emitted event.

```ts
import { ErrorEvent, StandardResponse, withEventMeta } from '@standardserver/core'

const response: StandardResponse = {
  status: 200,
  headers: {},
  async* body() {
    yield withEventMeta(
      { message: 'Hello, World!' },
      { id: '1', retry: 3000, comments: ['hidden'] },
    )

    throw ErrorEvent({ message: 'Something went wrong' })

    return { message: 'This is the end of the stream' }
  },
}
```

Events are interpreted as follows: `yield` emits a `message`, `throw` emits an `error`, and `return` emits a `close` event. Note that `close` does not cause [EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) to close the connection because it is not part of the SSE specification. However, when using Standard Server for client-side streaming, `close` is treated as the end of the stream, so the connection is closed and no reconnection is attempted.

### Octet-Stream Body

Standard Server uses [ReadableStream<Uint8Array>](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) to represent a binary streaming body.

```ts
import { StandardResponse } from '@standardserver/core'

const response: StandardResponse = {
  status: 200,
  headers: {
    'content-type': 'application/octet-stream',
  },
  body: new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode('Hello, World!'))
      controller.close()
    },
  }),
}
```

When sending a binary streaming body, Standard Server automatically sets the `content-type` and `standard-server` headers. You can override `content-type` by providing an explicit header value, or remove it entirely by assigning an empty array.

## HTTP Adapters

Use `@standardserver/fetch` to integrate with the Fetch API. For detailed implementation, see the [Fetch API adapter documentation](./packages/fetch/README.md).

```ts
import { toFetchBody, toFetchHeaders, toFetchResponse, toStandardLazyRequest, toStandardLazyResponse } from '@standardserver/fetch'

// server-side
export async function handleFetchRequest(request: Request): Promise<Response> {
  const standardLazyRequest = toStandardLazyRequest(request)
  const standardResponse = await handle(standardLazyRequest)
  return toFetchResponse(standardResponse, {/** options */})
}

// client-side
export async function main() {
  const standardRequest = {
    method: 'GET',
    url: '/api/data',
    headers: {},
    body: { message: 'Hello, World!' },
  }

  const [body, standardHeaders] = toFetchBody(standardRequest.body, standardRequest.headers, {/** options */})
  const response = await fetch(standardRequest.url, {
    method: standardRequest.method,
    headers: toFetchHeaders(standardHeaders),
    body,
  })

  const standardLazyResponse = toStandardLazyResponse(response)
}
```

Use `@standardserver/node` to integrate with Node.js HTTP and HTTP/2. For implementation details, see the [Node.js adapter documentation](./packages/node/README.md).

```ts
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'

const server = createServer(async (req, res) => {
  const standardLazyRequest = toStandardLazyRequest(req)
  const standardResponse = await handle(standardLazyRequest)
  await sendStandardResponse(res, standardResponse, {/** options */})
})
```

Use `@standardserver/fastify` to integrate with Fastify, over either HTTP or HTTP/2. It builds on the Node.js adapter, but writes the response through Fastify's reply so hooks and plugins keep working. For implementation details, see the [Fastify adapter documentation](./packages/fastify/README.md).

```ts
import { sendStandardResponse, toStandardLazyRequest } from '@standardserver/fastify'
import Fastify from 'fastify'

const fastify = Fastify()

fastify.all('/*', async (req, reply) => {
  const standardLazyRequest = toStandardLazyRequest(req, reply)
  const standardResponse = await handle(standardLazyRequest)
  await sendStandardResponse(reply, standardResponse, {/** options */})
})
```

> [!TIP]
> When sending requests or responses, you can pass additional options such as event-stream keep-alive.

## Message-Based Adapters

Unlike HTTP adapters, message-based adapters are built from the ground up to enable client-server communication through string or binary messages. They are ideal for WebSocket, MessagePort, or any custom transport implementations. For detailed implementation, see the [peer adapter documentation](./packages/peer/README.md).

```ts
import {
  ClientPeer,
  decodePeerMessage,
  encodePeerMessage,
  isClientPeerSendMessage,
  isServerPeerSendMessage,
  ServerPeer
} from '@standardserver/peer'

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
    await serverPeer.message(decoded.message, async (standardLazyRequest) => {
      const standardResponse = await handle(standardLazyRequest)
      return standardResponse
    })
  }
})

port1.start()
port2.start()

const standardLazyResponse = await clientPeer.request({
  method: 'GET',
  url: '/ping',
  headers: {},
})
```

> [!TIP]
> When encoding or decoding peer messages, you can pass additional options, such as `prefix`, to prevent collisions when the same peer is used for multiple purposes.

## Sponsors

Like what we build over at [middleapi](https://github.com/middleapi)? You can help keep it going here: [GitHub Sponsors](https://github.com/sponsors/dinwwwh). Every bit helps! 🚀

### 🏆 Platinum Sponsor

<table>
  <tr>
   <td align="center"><a href="https://screenshotone.com/?ref=orpc" target="_blank" rel="sponsored noopener" title="ScreenshotOne.com"><img src="https://avatars.githubusercontent.com/u/97035603?v=4" width="279" alt="ScreenshotOne.com"/><br />ScreenshotOne.com</a></td>
  </tr>
</table>

### 🥈 Silver Sponsor

<table>
  <tr>
   <td align="center"><a href="https://misskey.io/?ref=orpc" target="_blank" rel="sponsored noopener" title="村上さん"><img src="https://avatars.githubusercontent.com/u/37681609?u=0dd4c7e4ba937cbb52b068c55914b1d8164dc0c7&amp;v=4" width="209" alt="村上さん"/><br />村上さん</a></td>
  </tr>
</table>

### Generous Sponsors

<table>
  <tr>
   <td align="center"><a href="https://github.com/ln-markets?ref=orpc" target="_blank" rel="sponsored noopener" title="LN Markets"><img src="https://avatars.githubusercontent.com/u/70597625?v=4" width="167" alt="LN Markets"/><br />LN Markets</a></td>
  </tr>
</table>

### Sponsors

<table>
  <tr>
   <td align="center"><a href="https://github.com/hrmcdonald?ref=orpc" target="_blank" rel="sponsored noopener" title="Reece McDonald"><img src="https://avatars.githubusercontent.com/u/39349270?v=4" width="139" alt="Reece McDonald"/><br />Reece McDonald</a></td>
   <td align="center"><a href="https://github.com/u1-liquid?ref=orpc" target="_blank" rel="sponsored noopener" title="あわわわとーにゅ"><img src="https://avatars.githubusercontent.com/u/17376330?u=de3353804be889f009f7e0a1582daf04d0ab292d&amp;v=4" width="139" alt="あわわわとーにゅ"/><br />あわわわとーにゅ</a></td>
   <td align="center"><a href="https://github.com/nicognaW?ref=orpc" target="_blank" rel="sponsored noopener" title="nk"><img src="https://avatars.githubusercontent.com/u/66731869?u=4699bda3a9092d3ec34fbd959450767bcc8b8b6d&amp;v=4" width="139" alt="nk"/><br />nk</a></td>
   <td align="center"><a href="https://github.com/supastarter?ref=orpc" target="_blank" rel="sponsored noopener" title="supastarter"><img src="https://avatars.githubusercontent.com/u/110960143?v=4" width="139" alt="supastarter"/><br />supastarter</a></td>
   <td align="center"><a href="https://github.com/divmgl?ref=orpc" target="_blank" rel="sponsored noopener" title="Dexter Miguel"><img src="https://avatars.githubusercontent.com/u/5452298?u=645993204be8696c085ecf0d228c3062efe2ed65&amp;v=4" width="139" alt="Dexter Miguel"/><br />Dexter Miguel</a></td>
   <td align="center"><a href="https://github.com/herrfugbaum?ref=orpc" target="_blank" rel="sponsored noopener" title="herrfugbaum"><img src="https://avatars.githubusercontent.com/u/12859776?u=644dc1666d0220bc0468eb0de3c56b919f635b16&amp;v=4" width="139" alt="herrfugbaum"/><br />herrfugbaum</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://github.com/ryota-murakami?ref=orpc" target="_blank" rel="sponsored noopener" title="Ryota Murakami"><img src="https://avatars.githubusercontent.com/u/5501268?u=599389e03340734325726ca3f8f423c021d47d7f&amp;v=4" width="139" alt="Ryota Murakami"/><br />Ryota Murakami</a></td>
   <td align="center"><a href="https://github.com/dcramer?ref=orpc" target="_blank" rel="sponsored noopener" title="David Cramer"><img src="https://avatars.githubusercontent.com/u/23610?v=4" width="139" alt="David Cramer"/><br />David Cramer</a></td>
   <td align="center"><a href="https://github.com/valerii15298?ref=orpc" target="_blank" rel="sponsored noopener" title="Valerii Petryniak"><img src="https://avatars.githubusercontent.com/u/44531564?u=88ac74d9bacd20401518441907acad21063cd397&amp;v=4" width="139" alt="Valerii Petryniak"/><br />Valerii Petryniak</a></td>
   <td align="center"><a href="https://github.com/letstri?ref=orpc" target="_blank" rel="sponsored noopener" title="Valerii Strilets"><img src="https://avatars.githubusercontent.com/u/13253748?u=c7b10399ccc8f8081e24db94ec32cd9858e86ac3&amp;v=4" width="139" alt="Valerii Strilets"/><br />Valerii Strilets</a></td>
   <td align="center"><a href="https://github.com/K-Mistele?ref=orpc" target="_blank" rel="sponsored noopener" title="Kyle Mistele"><img src="https://avatars.githubusercontent.com/u/18430555?u=3afebeb81de666e35aaac3ed46f14159d7603ffb&amp;v=4" width="139" alt="Kyle Mistele"/><br />Kyle Mistele</a></td>
   <td align="center"><a href="https://github.com/christ12938?ref=orpc" target="_blank" rel="sponsored noopener" title="christ12938"><img src="https://avatars.githubusercontent.com/u/25758598?v=4" width="139" alt="christ12938"/><br />christ12938</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://github.com/Ryanjso?ref=orpc" target="_blank" rel="sponsored noopener" title="Ryan Soderberg"><img src="https://avatars.githubusercontent.com/u/39172778?u=5ed913c31d57e7221b75784abcad48c7ebddde27&amp;v=4" width="139" alt="Ryan Soderberg"/><br />Ryan Soderberg</a></td>
   <td align="center"><a href="https://github.com/itigoore01?ref=orpc" target="_blank" rel="sponsored noopener" title="shota"><img src="https://avatars.githubusercontent.com/u/11831107?u=c976a6dc7e055eb026304c46c99100ed22b0c8e0&amp;v=4" width="139" alt="shota"/><br />shota</a></td>
   <td align="center"><a href="https://github.com/ellis-driscoll?ref=orpc" target="_blank" rel="sponsored noopener" title="Ellis Driscoll"><img src="https://avatars.githubusercontent.com/u/70685966?u=c5f95bc33b5991d9744abe00052542e4a2ed3cb9&amp;v=4" width="139" alt="Ellis Driscoll"/><br />Ellis Driscoll</a></td>
  </tr>
</table>

### Backers

<table>
  <tr>
   <td align="center"><a href="https://github.com/rhinodavid?ref=orpc" target="_blank" rel="sponsored noopener" title="David Walsh"><img src="https://avatars.githubusercontent.com/u/5778036?u=b5521f07d2f88c3db2a0dae62b5f2f8357214af0&amp;v=4" width="119" alt="David Walsh"/><br />David Walsh</a></td>
   <td align="center"><a href="https://github.com/Robbe95?ref=orpc" target="_blank" rel="sponsored noopener" title="Robbe Vaes"><img src="https://avatars.githubusercontent.com/u/44748019?u=e0232402c045ad4eac7cbd217f1f47e083103b89&amp;v=4" width="119" alt="Robbe Vaes"/><br />Robbe Vaes</a></td>
   <td align="center"><a href="https://github.com/aidansunbury?ref=orpc" target="_blank" rel="sponsored noopener" title="Aidan Sunbury"><img src="https://avatars.githubusercontent.com/u/64103161?v=4" width="119" alt="Aidan Sunbury"/><br />Aidan Sunbury</a></td>
   <td align="center"><a href="https://github.com/soonoo?ref=orpc" target="_blank" rel="sponsored noopener" title="soonoo"><img src="https://avatars.githubusercontent.com/u/5436405?u=5d0b4aa955c87e30e6bda7f0cccae5402da99528&amp;v=4" width="119" alt="soonoo"/><br />soonoo</a></td>
   <td align="center"><a href="https://github.com/kporten?ref=orpc" target="_blank" rel="sponsored noopener" title="Kevin Porten"><img src="https://avatars.githubusercontent.com/u/1839345?u=dc2263d5cfe0d927ce1a0be04a1d55dd6b55405c&amp;v=4" width="119" alt="Kevin Porten"/><br />Kevin Porten</a></td>
   <td align="center"><a href="https://github.com/pumpkinlink?ref=orpc" target="_blank" rel="sponsored noopener" title="Denis"><img src="https://avatars.githubusercontent.com/u/11864620?u=5f47bbe6c65d0f6f5cf011021490238e4b0593d0&amp;v=4" width="119" alt="Denis"/><br />Denis</a></td>
   <td align="center"><a href="https://github.com/christopher-kapic?ref=orpc" target="_blank" rel="sponsored noopener" title="Christopher Kapic"><img src="https://avatars.githubusercontent.com/u/59740769?u=e7ad4b72b5bf6c9eb1644c26dbf3332a8f987377&amp;v=4" width="119" alt="Christopher Kapic"/><br />Christopher Kapic</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://github.com/thomasballinger?ref=orpc" target="_blank" rel="sponsored noopener" title="Tom Ballinger"><img src="https://avatars.githubusercontent.com/u/458879?u=4b045ac75d721b6ac2b42a74d7d37f61f0414031&amp;v=4" width="119" alt="Tom Ballinger"/><br />Tom Ballinger</a></td>
   <td align="center"><a href="https://github.com/SSam0419?ref=orpc" target="_blank" rel="sponsored noopener" title="Sam"><img src="https://avatars.githubusercontent.com/u/102863520?u=3c89611f549d5070be232eb4532f690c8f2e7a65&amp;v=4" width="119" alt="Sam"/><br />Sam</a></td>
   <td align="center"><a href="https://github.com/Titoine?ref=orpc" target="_blank" rel="sponsored noopener" title="Titoine"><img src="https://avatars.githubusercontent.com/u/3514286?u=1bb1e86b0c99c8a1121372e56d51a177eea12191&amp;v=4" width="119" alt="Titoine"/><br />Titoine</a></td>
   <td align="center"><a href="https://github.com/Mnigos?ref=orpc" target="_blank" rel="sponsored noopener" title="Igor Makowski"><img src="https://avatars.githubusercontent.com/u/56691628?u=ee8c879478f7c151b9156aef6c74243fa3e247a8&amp;v=4" width="119" alt="Igor Makowski"/><br />Igor Makowski</a></td>
   <td align="center"><a href="https://github.com/hanayashiki?ref=orpc" target="_blank" rel="sponsored noopener" title="hanayashiki"><img src="https://avatars.githubusercontent.com/u/26056783?u=06c3b9205a16fd41a871e82da1cc2a09306d53f5&amp;v=4" width="119" alt="hanayashiki"/><br />hanayashiki</a></td>
   <td align="center"><a href="https://github.com/ldub?ref=orpc" target="_blank" rel="sponsored noopener" title="Lev Dubinets"><img src="https://avatars.githubusercontent.com/u/3114081?u=f547f5d5012cab54851f1b1ad72d10e537f78fc2&amp;v=4" width="119" alt="Lev Dubinets"/><br />Lev Dubinets</a></td>
   <td align="center"><a href="https://github.com/mr-kelly?ref=orpc" target="_blank" rel="sponsored noopener" title="Kelly Peilin Chan"><img src="https://avatars.githubusercontent.com/u/520852?u=6b0f7105f694e7b5cacf410a3f04c7044b469dc8&amp;v=4" width="119" alt="Kelly Peilin Chan"/><br />Kelly Peilin Chan</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://github.com/guyariely?ref=orpc" target="_blank" rel="sponsored noopener" title="Guy Ariely"><img src="https://avatars.githubusercontent.com/u/42813496?u=edb6b7f563bf28e160a290832e7da57c0506f8ca&amp;v=4" width="119" alt="Guy Ariely"/><br />Guy Ariely</a></td>
   <td align="center"><a href="https://github.com/piscis?ref=orpc" target="_blank" rel="sponsored noopener" title="Alex"><img src="https://avatars.githubusercontent.com/u/326163?u=b245f368bd940cf51d08c0b6bf55f8257f359437&amp;v=4" width="119" alt="Alex"/><br />Alex</a></td>
   <td align="center"><a href="https://github.com/finom?ref=orpc" target="_blank" rel="sponsored noopener" title="Andrey Gubanov"><img src="https://avatars.githubusercontent.com/u/1082083?u=c5f2daf7ebece498e85c83367bb37b4e10e2649d&amp;v=4" width="119" alt="Andrey Gubanov"/><br />Andrey Gubanov</a></td>
  </tr>
</table>

With thanks to 37 past sponsors who helped get us here.
