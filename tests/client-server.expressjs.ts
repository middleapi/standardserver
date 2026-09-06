import type { AddressInfo } from 'node:net'
import type { ClientServerTest } from './client-server'
import { toFetchBody, toFetchHeaders, toStandardLazyResponse } from '@standard-server/fetch'
import { sendStandardResponse, toStandardLazyRequest } from '@standard-server/node'
import express from 'express'

export interface ExpressjsClientServerTestOptions {
  /**
   * Registers the body parsers a regular express app ships with, exercising the
   * `req.body` short-circuit in `toStandardBody` instead of reading the raw stream.
   */
  bodyParser?: boolean
}

export function createExpressjsClientServerTest(
  options: ExpressjsClientServerTestOptions = {},
): ClientServerTest {
  const handler: ClientServerTest['handler'] = vi.fn(async () => {
    return { status: 404, body: 'Not Found', headers: {} }
  })

  const app = express()

  if (options.bodyParser) {
    // the parsers a regular express project registers; body-parser leaves `req.body`
    // undefined for every other content type, so those bodies still reach the adapter as a stream
    //
    // `strict` must be off: it defaults to on, which rejects every top-level JSON value that
    // isn't an object or array (`"a string"`, `null`, `1`) with a 400 before the adapter runs
    app.use(express.json({ strict: false }))
  }

  app.use(async (req, res) => {
    const standardRequest = toStandardLazyRequest(req, res)
    const standardResponse = await handler(standardRequest)

    await sendStandardResponse(res, standardResponse)
  })

  const server = app.listen(0)

  afterAll(() => {
    server.close()
  })

  const addressInfo = server.address() as AddressInfo

  const request: ClientServerTest['request'] = vi.fn(async (standardRequest) => {
    const id = crypto.randomUUID()

    const [body, standardHeaders] = toFetchBody(standardRequest.body, standardRequest.headers)

    standardHeaders.id = id

    const response = await fetch(`http://localhost:${addressInfo.port}${standardRequest.url}`, {
      method: standardRequest.method,
      headers: toFetchHeaders(standardHeaders),
      body: body ?? null,
      duplex: 'half',
      signal: standardRequest.signal ?? null,
    })

    const standardResponse = toStandardLazyResponse(response)

    return standardResponse
  })

  return {
    handler,
    request,
  }
}
