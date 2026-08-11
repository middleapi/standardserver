# @standardserver/core

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
