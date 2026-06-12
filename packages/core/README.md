# @standardserver/core

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

`@standardserver/core` is the shared contract package for Standard Server.

Standard Server provides a unified interface for client-server communication across HTTP and message-based transports. It lets you keep handler and client code transport-agnostic by working with the same request, response, body, and streaming abstractions whether the transport is Fetch, Node.js HTTP, or a peer-style message channel.

This package is the foundation of that model. It defines the core request and response types, shared runtime validators, small utility helpers, and event stream (SSE) helpers.

## Entry Points

| Entry point            | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `@standardserver/core` | Shared request/response types, utilities, and validators |

## Request and response types

The main entry point exposes four transport-agnostic shapes:

| Export                 | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `StandardRequest`      | Eager request object with a parsed `body`                       |
| `StandardLazyRequest`  | Request object with `resolveBody(hint?)` for lazy body parsing  |
| `StandardResponse`     | Eager response object with a parsed `body`                      |
| `StandardLazyResponse` | Response object with `resolveBody(hint?)` for lazy body parsing |

Supporting primitives:

| Export             | Description                                                   |
| ------------------ | ------------------------------------------------------------- |
| `StandardMethod`   | Common HTTP verbs plus any custom string value                |
| `StandardUrl`      | A request URL that must start with `/` and exclude the origin |
| `StandardHeaders`  | `Record<string, string \| string[] \| undefined>`             |
| `StandardBodyHint` | Parsing hint for lazy body resolution                         |
| `StandardBody`     | Shared body union used by requests and responses              |

By convention, adapters normalize headers to lowercase keys. `signal` is part of `StandardRequest` only and is used to propagate request cancellation.

```ts
import type { StandardLazyRequest, StandardResponse } from '@standardserver/core'

export async function handle(request: StandardLazyRequest): Promise<StandardResponse> {
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
```

### Body hints and body values

`StandardBodyHint` and `StandardBody` describe the shared body contract used across adapters:

| Hint                | `StandardBody` value           | Typical content type                | Notes                                                 |
| ------------------- | ------------------------------ | ----------------------------------- | ----------------------------------------------------- |
| `json`              | `unknown`                      | `application/json`                  | Primitives, objects, and arrays                       |
| `form-data`         | `FormData`                     | `multipart/form-data`               | Multipart form submissions                            |
| `url-search-params` | `URLSearchParams`              | `application/x-www-form-urlencoded` | URL-encoded forms                                     |
| `event-stream`      | `AsyncIteratorObject<unknown>` | `text/event-stream`                 | Server-Sent Events (SSE)                              |
| `octet-stream`      | `ReadableStream<Uint8Array>`   | any                                 | Binary payloads                                       |
| `file`              | `File`                         | any                                 | Fixed-size binary payloads for both `File` and `Blob` |
| `none`              | `undefined`                    |                                     | Empty body                                            |

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

## Utilities

The main entry point also exports a small set of helpers for common header and URL operations.

### Content-Disposition helpers

Use `generateContentDisposition()` to produce a safe `Content-Disposition` value and `getFilenameFromContentDisposition()` to read a filename back from an existing header.

```ts
import {
  generateContentDisposition,
  getFilenameFromContentDisposition,
} from '@standardserver/core'

const disposition = generateContentDisposition('report "Q2".csv')
// inline; filename="report \"Q2\".csv"; filename*=utf-8''report%20%22Q2%22.csv

const filename = getFilenameFromContentDisposition(disposition)
// 'report "Q2".csv'
```

`generateContentDisposition()` preserves an ASCII-safe `filename="..."` value and also emits `filename*=` for UTF-8 aware clients.

### Header helpers

`mergeStandardHeaders()` combines two `StandardHeaders` objects while preserving duplicate values, and `flattenStandardHeader()` turns a single header value into a plain string when needed.

```ts
import {
  flattenStandardHeader,
  mergeStandardHeaders,
} from '@standardserver/core'

const headers = mergeStandardHeaders(
  { 'accept': 'application/json', 'set-cookie': ['a=1'] },
  { 'set-cookie': 'b=2', 'vary': 'accept', 'warning': undefined },
)
// {
//   accept: 'application/json',
//   'set-cookie': ['a=1', 'b=2'],
//   vary: 'accept',
// }

const cookieHeader = flattenStandardHeader(headers['set-cookie'])
// 'a=1, b=2'
```

### URL parsing

`parseStandardUrl()` splits a `StandardUrl` into `[pathname, search, hash]` without requiring a full origin.

```ts
import { parseStandardUrl } from '@standardserver/core'

const [pathname, search, hash] = parseStandardUrl('/users/123?tab=settings#profile')
// pathname => '/users/123'
// search => '?tab=settings'
// hash => '#profile'
```

## Validators

Runtime type guards are useful when requests or responses cross process, transport, or message boundaries.

| Export                 | Checks                                                 |
| ---------------------- | ------------------------------------------------------ |
| `isStandardMethod()`   | Any string value                                       |
| `isStandardUrl()`      | A string starting with `/`                             |
| `isStandardHeaders()`  | Object values are `string`, `string[]`, or `undefined` |
| `isStandardRequest()`  |                                                        |
| `isStandardResponse()` |                                                        |

```ts
import { isStandardRequest } from '@standardserver/core'

export function expectStandardRequest(input: unknown) {
  if (!isStandardRequest(input)) {
    throw new TypeError('Expected a StandardRequest-compatible value')
  }

  return input
}
```

## Event-Stream Helpers

Use Event-Stream Helpers when you need explicit SSE encoding, decoding, or metadata handling.

### Message types and codecs

The event-stream entry point exposes:

- `EventMeta` for `id`, `retry`, and `comments`
- `EventStreamMessage` for complete SSE messages
- `encodeEventStreamMessage()` and `decodeEventStreamMessage()` for single-message codec operations
- `EventStreamDecoder` and `EventStreamDecoderStream` for chunked stream decoding

```ts
import {
  decodeEventStreamMessage,
  encodeEventStreamMessage,
} from '@standardserver/core'

const encoded = encodeEventStreamMessage({
  comments: ['bootstrap'],
  event: 'message',
  id: '42',
  retry: 3000,
  data: 'hello\nworld',
})

const decoded = decodeEventStreamMessage(encoded)
// {
//   comments: ['bootstrap'],
//   event: 'message',
//   id: '42',
//   retry: 3000,
//   data: 'hello\nworld',
// }
```

For streaming decode, pipe text chunks through `EventStreamDecoderStream`:

```ts
import { EventStreamDecoderStream } from '@standardserver/core'

const messages = response.body!
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new EventStreamDecoderStream())
```

### Iterator metadata helpers

`StandardBody` uses async iterators for event-stream bodies. To attach SSE metadata to a yielded value without changing its visible shape, use `withEventMeta()`.

```ts
import type { StandardResponse } from '@standardserver/core'
import { getEventMeta, unwrapEvent, withEventMeta } from '@standardserver/core'

const event = withEventMeta(
  { message: 'hello' },
  { id: '1', retry: 3000, comments: ['bootstrap'] },
)

const [data, meta] = unwrapEvent(event)
// data => { message: 'hello' }
// meta => { id: '1', retry: 3000, comments: ['bootstrap'] }

const extractedMeta = getEventMeta(event)
// { id: '1', retry: 3000, comments: ['bootstrap'] }

const response: StandardResponse = {
  status: 200,
  headers: {},
  async* body() {
    yield event
  },
}
```

> [!WARNING]
> Metadata is validated before it is attached: `id`, `event`, and comments must not contain line breaks, and `retry` must be a non-negative integer.

### Errors and low-level assertions

The subpath also exports:

- `EventStreamEncoderError` for invalid outbound SSE messages
- `EventStreamDecoderError` for incomplete or invalid inbound stream decoding
- `ErrorEvent` for wrapping structured event-stream error payloads in an `Error`
- `assertEventStreamMessageId()`, `assertEventStreamMessageName()`, `assertEventStreamMessageRetry()`, and `assertEventStreamMessageComment()` for low-level validation when building custom SSE tooling

```ts
import { ErrorEvent } from '@standardserver/core'

const error = new ErrorEvent(
  { code: 'E_STREAM', detail: 'Connection lost' },
  { message: 'stream error' },
)

error.message
// 'stream error'

error.data
// { code: 'E_STREAM', detail: 'Connection lost' }
```

## Learn more

For the higher-level project overview, see the root [Standard Server README](../../README.md).

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/middleapi/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/middleapi/static/sponsors.svg' alt="Sponsors"/>
  </a>
</p>
