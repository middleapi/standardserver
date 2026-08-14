import type { IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ClientServerTest } from './client-server'
import * as fs from 'node:fs'
import * as https from 'node:https'
import { Readable } from 'node:stream'
import { toFetchBody, toFetchHeaders, toStandardLazyResponse } from '@standardserver/fetch'
import { sendStandardResponse, toStandardLazyRequest } from '@standardserver/node'

export function createNodeHttpsClientServerTest(): ClientServerTest {
  const handler: ClientServerTest['handler'] = vi.fn(async () => {
    return { status: 404, body: 'Not Found', headers: {} }
  })

  const cert = fs.readFileSync(new URL('./fixtures/localhost-cert.pem', import.meta.url))

  const server = https.createServer({
    cert,
    key: fs.readFileSync(new URL('./fixtures/localhost-key.pem', import.meta.url)),
  }, async (req, res) => {
    const standardRequest = toStandardLazyRequest(req, res)
    const standardResponse = await handler(standardRequest)

    await sendStandardResponse(res, standardResponse)
  })

  server.listen(0)

  const addressInfo = server.address() as AddressInfo

  // fetch cannot trust a custom CA per-request, so requests go through a raw https client
  const agent = new https.Agent({ ca: cert })

  afterAll(() => {
    agent.destroy()
    server.close()
    server.closeAllConnections()
  })

  const request: ClientServerTest['request'] = vi.fn(async (standardRequest) => {
    standardRequest.signal?.throwIfAborted()

    const [body, standardHeaders] = toFetchBody(standardRequest.body, standardRequest.headers)

    // Normalize the fetch body (Blob, FormData, ...) into a byte stream and let
    // fetch fill in derived headers such as the multipart boundary.
    const fetchRequest = new Request(`https://localhost:${addressInfo.port}${standardRequest.url}`, {
      method: standardRequest.method,
      headers: toFetchHeaders(standardHeaders),
      body: body ?? null,
      duplex: 'half',
    })

    const requestHeaders: Record<string, string> = {}
    fetchRequest.headers.forEach((value, key) => {
      requestHeaders[key] = value
    })

    const req = https.request({
      host: 'localhost',
      port: addressInfo.port,
      path: `${standardRequest.url}`,
      method: standardRequest.method,
      headers: requestHeaders,
      agent,
    })

    if (fetchRequest.body) {
      // node's http client only defaults to chunked encoding for POST-like methods,
      // for the rest (e.g. DELETE) it would send the body without any framing
      ;(req as any).useChunkedEncodingByDefault = true
    }

    standardRequest.signal?.addEventListener('abort', () => {
      req.destroy(standardRequest.signal!.reason)
    })

    if (fetchRequest.body) {
      void (async () => {
        const reader = fetchRequest.body!.getReader()

        try {
          while (true) {
            const { done, value } = await reader.read()

            if (req.destroyed || req.writableEnded) {
              return // abandon the body without cancelling it, like fetch does
            }

            if (done) {
              req.end()
              return
            }

            if (!req.write(value)) {
              await new Promise<void>((resolve) => {
                req.once('drain', resolve)
                req.once('close', resolve)
              })
            }
          }
        }
        catch (error) {
          req.destroy(error as Error)
        }
      })()
    }
    else {
      req.end()
    }

    const res = await new Promise<IncomingMessage>((resolve, reject) => {
      req.once('response', resolve)
      req.once('error', reject)
    })

    const headers = new Headers()
    for (const [key, value] of Object.entries(res.headers)) {
      if (value === undefined) {
        continue
      }

      for (const item of Array.isArray(value) ? value : [value]) {
        headers.append(key, item)
      }
    }

    const response = new Response(Readable.toWeb(res) as ReadableStream, {
      status: res.statusCode!,
      headers,
    })

    return toStandardLazyResponse(response)
  })

  return {
    handler,
    request,
  }
}
