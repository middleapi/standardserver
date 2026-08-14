import type { Http2ServerRequest, Http2ServerResponse } from 'node:http2'
import type { AddressInfo } from 'node:net'
import type { ClientServerTest } from './client-server'
import * as fs from 'node:fs'
import * as http2 from 'node:http2'
import { Readable } from 'node:stream'
import { toFetchBody, toFetchHeaders, toStandardLazyResponse } from '@standardserver/fetch'
import { sendStandardResponse, toStandardLazyRequest } from '@standardserver/node'

export interface NodeHttp2ClientServerTestOptions {
  /** Serve over TLS (https) with a self-signed localhost certificate. */
  secure?: boolean
}

export function createNodeHttp2ClientServerTest(options: NodeHttp2ClientServerTestOptions = {}): ClientServerTest {
  const handler: ClientServerTest['handler'] = vi.fn(async () => {
    return { status: 404, body: 'Not Found', headers: {} }
  })

  const requestListener = async (req: Http2ServerRequest, res: Http2ServerResponse) => {
    // a client RST_STREAM surfaces as an 'error' on the raw stream (not on `res`),
    // and crashes the process unless something listens to it
    res.stream.on('error', () => {})

    const standardRequest = toStandardLazyRequest(req, res)
    const standardResponse = await handler(standardRequest)

    // rejects when the client aborts the stream mid-response
    await sendStandardResponse(res, standardResponse).catch(() => {})
  }

  const cert = options.secure
    ? fs.readFileSync(new URL('./fixtures/localhost-cert.pem', import.meta.url))
    : undefined

  const server = options.secure
    ? http2.createSecureServer({
        cert,
        key: fs.readFileSync(new URL('./fixtures/localhost-key.pem', import.meta.url)),
      }, requestListener)
    : http2.createServer(requestListener)

  server.listen(0)

  const addressInfo = server.address() as AddressInfo

  // fetch cannot speak h2c, so requests go through a raw http2 client session
  const session = options.secure
    ? http2.connect(`https://localhost:${addressInfo.port}`, { ca: cert })
    : http2.connect(`http://localhost:${addressInfo.port}`)
  session.on('error', () => {})

  afterAll(() => {
    session.destroy()
    server.close()
  })

  const request: ClientServerTest['request'] = vi.fn(async (standardRequest) => {
    standardRequest.signal?.throwIfAborted()

    const [body, standardHeaders] = toFetchBody(standardRequest.body, standardRequest.headers)

    // Normalize the fetch body (Blob, FormData, ...) into a byte stream and let
    // fetch fill in derived headers such as the multipart boundary.
    const fetchRequest = new Request(`http://localhost:${addressInfo.port}${standardRequest.url}`, {
      method: standardRequest.method,
      headers: toFetchHeaders(standardHeaders),
      body: body ?? null,
      duplex: 'half',
    })

    const requestHeaders: http2.OutgoingHttpHeaders = {
      ':method': standardRequest.method,
      ':path': `${standardRequest.url}`,
    }
    fetchRequest.headers.forEach((value, key) => {
      requestHeaders[key] = value
    })

    const stream = session.request(requestHeaders, { endStream: fetchRequest.body === null })

    standardRequest.signal?.addEventListener('abort', () => {
      stream.destroy(standardRequest.signal!.reason)
    })

    if (fetchRequest.body) {
      void (async () => {
        const reader = fetchRequest.body!.getReader()

        try {
          while (true) {
            const { done, value } = await reader.read()

            if (stream.destroyed || stream.writableEnded) {
              return // abandon the body without cancelling it, like fetch does
            }

            if (done) {
              stream.end()
              return
            }

            if (!stream.write(value)) {
              await new Promise<void>((resolve) => {
                stream.once('drain', resolve)
                stream.once('close', resolve)
              })
            }
          }
        }
        catch (error) {
          stream.destroy(error as Error)
        }
      })()
    }

    const responseHeaders = await new Promise<http2.IncomingHttpHeaders>((resolve, reject) => {
      stream.once('response', resolve)
      stream.once('error', reject)
    })

    const headers = new Headers()
    for (const [key, value] of Object.entries(responseHeaders)) {
      if (key.startsWith(':') || value === undefined) {
        continue
      }

      for (const item of Array.isArray(value) ? value : [value]) {
        headers.append(key, item)
      }
    }

    const response = new Response(Readable.toWeb(stream) as ReadableStream, {
      status: Number(responseHeaders[':status']),
      headers,
    })

    return toStandardLazyResponse(response)
  })

  return {
    handler,
    request,
  }
}
