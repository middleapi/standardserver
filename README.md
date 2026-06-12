# Standard Server

<div align="center">
  <a href="https://codecov.io/gh/middleapi/standardserver">
    <img alt="codecov" src="https://codecov.io/gh/middleapi/standardserver/branch/main/graph/badge.svg">
  </a>
  <a href="https://www.npmjs.com/package/@standardserver/core">
    <img alt="weekly downloads" src="https://img.shields.io/npm/dw/%40standardserver%2Fcore?logo=npm" />
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

| Package                 | Purpose                                 | Main entry points                                                                                     |
| ----------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@standardserver/core`  | Shared types, validators, and utilities | `StandardRequest`, `StandardLazyRequest`, `StandardResponse`, `StandardLazyResponse`                  |
| `@standardserver/fetch` | Fetch API adapter                       | `toStandardLazyRequest`, `toFetchResponse`, `toStandardLazyResponse`, `toFetchBody`, `toFetchHeaders` |
| `@standardserver/node`  | Node.js HTTP/HTTP2 adapter              | `toStandardLazyRequest`, `sendStandardResponse`                                                       |
| `@standardserver/peer`  | Message-based adapter                   | `ClientPeer`, `ServerPeer`, `encodePeerMessage`, `decodePeerMessage`                                  |

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

1. If the `standard-server` header is present, use it as the `StandardBodyHint`.
2. Otherwise, if `hint?` is provided, use it as the `StandardBodyHint`.
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

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/middleapi/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/middleapi/static/sponsors.svg' alt="Sponsors"/>
  </a>
</p>
