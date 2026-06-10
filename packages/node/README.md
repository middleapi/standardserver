# @standardserver/node

<div align="center">
  <a href="https://codecov.io/gh/middleapi/standardserver">
    <img alt="codecov" src="https://codecov.io/gh/middleapi/standardserver/branch/main/graph/badge.svg">
  </a>
  <a href="https://www.npmjs.com/package/@standardserver/node">
    <img alt="weekly downloads" src="https://img.shields.io/npm/dw/%40standardserver%2Fnode?logo=npm" />
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

`@standardserver/node` adapts Node.js HTTP request and response objects to the transport-agnostic request and response model defined by Standard Server.

Standard Server provides a unified interface for client-server communication across HTTP and message-based transports. It lets you write handlers against the same request, response, body, and streaming primitives whether the underlying transport is the Fetch API, Node.js HTTP, HTTP/2, or a peer-style message channel.

This package is the Node.js adapter for that model. It converts between native Node request and response objects and the corresponding Standard Server shapes from `@standardserver/core`, while also exposing lower-level utilities for body parsing, URL normalization, abort signals, and server-sent events.

## Entry Point

The package exports a single entry point:

| Export                 | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `@standardserver/node` | Node.js adapter helpers for requests, responses, and SSE |

## Package overview

The main entry point exposes four groups of helpers:

| Group                   | Exports                                                                                                                | Purpose                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Request and response    | `toStandardLazyRequest()`, `sendStandardResponse()`                                                                    | Adapt Node request and response objects to Standard Server         |
| Body and event streams  | `toStandardBody()`, `toNodeHttpBody()`, `toEventIterator()`, `toEventStream()`                                         | Parse incoming bodies and serialize outgoing bodies, including SSE |
| Request utilities       | `toStandardMethod()`, `toStandardUrl()`, `toAbortSignal()`                                                             | Normalize Node request metadata and connection lifecycle state     |
| Types and option shapes | `NodeHttpRequest`, `NodeHttpResponse`, `ToStandardBodyOptions`, `ToNodeHttpBodyOptions`, `SendStandardResponseOptions` | Type request/response inputs and serializer options                |

Use these helpers when you want Standard Server handlers to run in Node runtimes such as `node:http`, `node:http2`, Express-style middleware, or frameworks that expose Node-compatible request and response objects.

## Server-side request handling

Use `toStandardLazyRequest()` to convert an incoming Node request into a `StandardLazyRequest`, then `sendStandardResponse()` to write the resulting `StandardResponse` back to the client.

```ts
import type { StandardLazyRequest, StandardResponse } from '@standardserver/core'
import { createServer } from 'node:http'
import { sendStandardResponse, toStandardLazyRequest } from '@standardserver/node'

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

createServer(async (req, res) => {
  const standardRequest = toStandardLazyRequest(req, res)
  const standardResponse = await handle(standardRequest)

  await sendStandardResponse(res, standardResponse, {/** options */})
}).listen(3000)
```

> [!TIP]
> When sending responses, you can pass additional options such as event-stream keep-alive.

## Resolving Body

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

## Learn more

For the higher-level project overview, see the root [Standard Server README](../../README.md).

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/middleapi/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/middleapi/static/sponsors.svg' alt="Sponsors"/>
  </a>
</p>
