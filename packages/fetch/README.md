# @standardserver/fetch

<div align="center">
  <a href="https://codecov.io/gh/middleapi/standardserver">
    <img alt="codecov" src="https://codecov.io/gh/middleapi/standardserver/branch/main/graph/badge.svg">
  </a>
  <a href="https://www.npmjs.com/package/@standardserver/fetch">
    <img alt="weekly downloads" src="https://img.shields.io/npm/dw/%40standardserver%2Ffetch?logo=npm" />
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

`@standardserver/fetch` adapts the Fetch API to the transport-agnostic request and response model defined by Standard Server.

Standard Server provides a unified interface for client-server communication across HTTP and message-based transports. It lets you write handlers and clients against the same request, response, body, and streaming primitives whether the underlying transport is Fetch, Node.js HTTP, or a peer-style message channel.

This package is the Fetch API adapter for that model. It converts between native `Request`, `Response`, `Headers`, and stream values and the corresponding Standard Server shapes from `@standardserver/core`.

## Entry Points

The package exports a single entry point:

| Export                  | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `@standardserver/fetch` | Fetch adapter helpers for requests, responses, bodies, headers, and SSE |

## Package overview

The main entry point exposes three groups of helpers:

| Group                   | Exports                                                                     | Purpose                                               |
| ----------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Request and response    | `toStandardLazyRequest()`, `toStandardLazyResponse()`, `toFetchResponse()`  | Convert between Fetch API objects and Standard Server |
| Body and stream helpers | `toStandardBody()`, `toFetchBody()`, `toEventIterator()`, `toEventStream()` | Parse and serialize body values, including SSE        |
| Header and URL helpers  | `toStandardHeaders()`, `toFetchHeaders()`, `toStandardUrl()`                | Normalize Fetch headers and URLs for Standard Server  |

Use these helpers when you want Standard Server handlers to run in Fetch-based runtimes such as browsers, Cloudflare Workers, Bun, Deno, service workers, or server frameworks that expose the standard Fetch API.

## Server-side request handling

Use `toStandardLazyRequest()` to convert an incoming Fetch `Request` into a `StandardLazyRequest`.

```ts
import type { StandardLazyRequest, StandardResponse } from '@standardserver/core'
import { toFetchResponse, toStandardLazyRequest } from '@standardserver/fetch'

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

export async function fetchHandler(request: Request): Promise<Response> {
  const standardRequest = toStandardLazyRequest(request)
  const standardResponse = await handle(standardRequest)
  return toFetchResponse(standardResponse, {/** options */})
}
```

> [!TIP]
> When sending requests or responses, you can pass additional options such as event-stream keep-alive.

## Client-side response handling

Use `toStandardLazyResponse()` when you receive a Fetch `Response` but want to work with the Standard Server response contract.

```ts
import { toFetchBody, toFetchHeaders, toStandardLazyResponse } from '@standardserver/fetch'

const standardRequest = {
  method: 'POST',
  url: '/echo',
  headers: { 'content-type': 'application/json' },
  body: { message: 'hello' },
}

const [body, headers] = toFetchBody(standardRequest.body, standardRequest.headers, {/** options */})
const response = await fetch(standardRequest.url, {
  method: standardRequest.method,
  headers: toFetchHeaders(headers),
  body,
})

const standardResponse = toStandardLazyResponse(response)
const payload = await standardResponse.resolveBody()
```

> [!TIP]
> When sending requests or responses, you can pass additional options such as event-stream keep-alive.

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
