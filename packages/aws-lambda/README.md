# @standardserver/aws-lambda

<div align="center">
  <a href="https://codecov.io/gh/middleapi/standardserver">
    <img alt="codecov" src="https://codecov.io/gh/middleapi/standardserver/branch/main/graph/badge.svg">
  </a>
  <a href="https://www.npmjs.com/package/@standardserver/aws-lambda">
    <img alt="weekly downloads" src="https://img.shields.io/npm/dw/%40standardserver%2Faws-lambda?logo=npm" />
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

`@standardserver/aws-lambda` adapts AWS Lambda events and response streams to the transport-agnostic request and response model defined by Standard Server.

Standard Server provides a unified interface for client-server communication across HTTP and message-based transports. It lets you write handlers against the same request, response, body, and streaming primitives whether the underlying transport is the Fetch API, Node.js HTTP, HTTP/2, or a peer-style message channel.

This package is the AWS Lambda adapter for that model. It converts an API Gateway proxy event — payload format version 1.0 or 2.0, the latter also used by Lambda Function URLs — into a `StandardLazyRequest`, and writes a `StandardResponse` back through the stream provided by `awslambda.streamifyResponse`, so streaming bodies such as server-sent events flow to the client as they are produced instead of being buffered.

## Entry Point

The package exports a single entry point:

| Export                       | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `@standardserver/aws-lambda` | AWS Lambda adapter helpers for events and response streams |

## Package overview

The main entry point exposes these helpers:

| Group                   | Exports                                                                                                                                             | Purpose                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Request and response    | `toStandardLazyRequest()`, `sendStandardResponse()`                                                                                                 | Adapt Lambda events and response streams to Standard Server |
| Lower-level helpers     | `toStandardUrl()`, `toStandardHeaders()`, `getEventHeader()`, `toStandardBody()`, `toLambdaHeaders()`                                               | Convert individual pieces of an event                       |
| Types and option shapes | `APIGatewayProxyEvent`, `APIGatewayProxyEventV2`, `AnyAPIGatewayProxyEvent`, `HttpResponseStream`, `AwsLambdaGlobal`, `SendStandardResponseOptions` | Type handler inputs and serializer options                  |

`APIGatewayProxyEvent` and `APIGatewayProxyEventV2` are structural subsets of the same-named types from `@types/aws-lambda`, so events typed with either work; the adapter accepts both via `AnyAPIGatewayProxyEvent` and tells them apart by the top-level `httpMethod` field only payload format 1.0 carries. `AwsLambdaGlobal` describes the `awslambda` global the Lambda Node.js runtime injects — the package deliberately does not `declare global`, so importing it never pollutes your project's global types. Declare the global yourself where you need typed access to `awslambda.streamifyResponse`.

## Server-side request handling

Use `toStandardLazyRequest()` to convert the incoming event into a `StandardLazyRequest`, then `sendStandardResponse()` to write the resulting `StandardResponse` back through the response stream. The handler must be wrapped with `awslambda.streamifyResponse`, and the function must run on the AWS Lambda Node.js runtime with response streaming enabled.

```ts
import type { AwsLambdaGlobal } from '@standardserver/aws-lambda'
import type { StandardLazyRequest, StandardResponse } from '@standardserver/core'
import { sendStandardResponse, toStandardLazyRequest } from '@standardserver/aws-lambda'

// injected by the AWS Lambda Node.js runtime when response streaming is enabled
declare const awslambda: AwsLambdaGlobal

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

export const handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
  const standardRequest = toStandardLazyRequest(event, responseStream)
  const standardResponse = await handle(standardRequest)

  await sendStandardResponse(responseStream, standardResponse, {/** options */})
})
```

`sendStandardResponse()` sends the status, headers, and cookies as the response stream metadata prelude via `awslambda.HttpResponseStream.from()`, then streams the body. It resolves once the response is fully flushed, and rejects if the stream errors.

> [!TIP]
> When sending responses, you can pass additional options such as event-stream keep-alive.

## Resolving Body

The event carries the request body as a fully buffered, optionally base64-encoded string. `resolveBody(hint?)` decodes it and determines how to parse it using the following priority:

1. If `hint?` is provided, use it as the `StandardBodyHint`.
2. Otherwise, if the `standard-server` header is present, use it as the `StandardBodyHint`.
3. Otherwise, if `content-type` is one of the common types, parse accordingly.
4. Otherwise, if `content-length` exists, treat the body as `file`; if not, treat it as `octet-stream`.

> [!TIP]
> For efficient communication, set the `standard-server` header to explicitly hint the body type, especially for file or binary streaming. For example, if you upload a file with a common `content-type` such as `application/json` but omit the `standard-server` header, the server may interpret it as JSON and parse it unexpectedly.

## Lambda behavior to be aware of

- **Response streaming must be enabled.** `sendStandardResponse()` relies on the `awslambda` global, which only exists on the AWS Lambda Node.js runtime, and on the metadata prelude of `awslambda.HttpResponseStream`, which the platform only interprets for streaming-enabled invocations.
- **`set-cookie` is sent via metadata cookies.** Multiple cookies survive because they are sent through the dedicated `cookies` metadata field; every other multi-value header is joined with `, `.
- **Request bodies are buffered.** API Gateway delivers the whole request body at once, so request-side streaming degrades to a single buffered chunk. Response-side streaming is real streaming.
- **Payload format 1.0 query strings are re-encoded.** API Gateway delivers them url-decoded, so the adapter re-encodes them when reconstructing the standard url. Payload format 2.0 provides the already encoded `rawQueryString`, which is used as-is.
- **Payload format 2.0 cookies are restored.** API Gateway strips the `cookie` header into the separate `cookies` field, and the adapter joins them back into a `cookie` header on the standard request.

## Learn more

For the higher-level project overview, see the root [Standard Server README](../../README.md).

For the Node.js primitives this adapter is built on, see the [Node.js adapter documentation](../node/README.md).

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
   <td align="center"><a href="https://github.com/nicognaW?ref=orpc" target="_blank" rel="sponsored noopener" title="nk"><img src="https://avatars.githubusercontent.com/u/66731869?u=4699bda3a9092d3ec34fbd959450767bcc8b8b6d&amp;v=4" width="139" alt="nk"/><br />nk</a></td>
   <td align="center"><a href="https://github.com/supastarter?ref=orpc" target="_blank" rel="sponsored noopener" title="supastarter"><img src="https://avatars.githubusercontent.com/u/110960143?v=4" width="139" alt="supastarter"/><br />supastarter</a></td>
   <td align="center"><a href="https://github.com/divmgl?ref=orpc" target="_blank" rel="sponsored noopener" title="Dexter Miguel"><img src="https://avatars.githubusercontent.com/u/5452298?u=645993204be8696c085ecf0d228c3062efe2ed65&amp;v=4" width="139" alt="Dexter Miguel"/><br />Dexter Miguel</a></td>
   <td align="center"><a href="https://github.com/herrfugbaum?ref=orpc" target="_blank" rel="sponsored noopener" title="herrfugbaum"><img src="https://avatars.githubusercontent.com/u/12859776?u=644dc1666d0220bc0468eb0de3c56b919f635b16&amp;v=4" width="139" alt="herrfugbaum"/><br />herrfugbaum</a></td>
   <td align="center"><a href="https://github.com/ryota-murakami?ref=orpc" target="_blank" rel="sponsored noopener" title="Ryota Murakami"><img src="https://avatars.githubusercontent.com/u/5501268?u=599389e03340734325726ca3f8f423c021d47d7f&amp;v=4" width="139" alt="Ryota Murakami"/><br />Ryota Murakami</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://github.com/dcramer?ref=orpc" target="_blank" rel="sponsored noopener" title="David Cramer"><img src="https://avatars.githubusercontent.com/u/23610?v=4" width="139" alt="David Cramer"/><br />David Cramer</a></td>
   <td align="center"><a href="https://github.com/valerii15298?ref=orpc" target="_blank" rel="sponsored noopener" title="Valerii Petryniak"><img src="https://avatars.githubusercontent.com/u/44531564?u=88ac74d9bacd20401518441907acad21063cd397&amp;v=4" width="139" alt="Valerii Petryniak"/><br />Valerii Petryniak</a></td>
   <td align="center"><a href="https://github.com/letstri?ref=orpc" target="_blank" rel="sponsored noopener" title="Valerii Strilets"><img src="https://avatars.githubusercontent.com/u/13253748?u=c7b10399ccc8f8081e24db94ec32cd9858e86ac3&amp;v=4" width="139" alt="Valerii Strilets"/><br />Valerii Strilets</a></td>
   <td align="center"><a href="https://github.com/K-Mistele?ref=orpc" target="_blank" rel="sponsored noopener" title="Kyle Mistele"><img src="https://avatars.githubusercontent.com/u/18430555?u=3afebeb81de666e35aaac3ed46f14159d7603ffb&amp;v=4" width="139" alt="Kyle Mistele"/><br />Kyle Mistele</a></td>
   <td align="center"><a href="https://github.com/christ12938?ref=orpc" target="_blank" rel="sponsored noopener" title="christ12938"><img src="https://avatars.githubusercontent.com/u/25758598?v=4" width="139" alt="christ12938"/><br />christ12938</a></td>
   <td align="center"><a href="https://github.com/Ryanjso?ref=orpc" target="_blank" rel="sponsored noopener" title="Ryan Soderberg"><img src="https://avatars.githubusercontent.com/u/39172778?u=5ed913c31d57e7221b75784abcad48c7ebddde27&amp;v=4" width="139" alt="Ryan Soderberg"/><br />Ryan Soderberg</a></td>
  </tr>
  <tr>
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

[With thanks to 38 past sponsors who helped get us here.](https://github.com/sponsors/dinwwwh)
