import type { AddressInfo } from 'node:net'
import type { ClientServerTest } from './client-server'
import * as http from 'node:http'
import { urlToString } from '@standardserver/core'
import { toFetchBody, toFetchHeaders, toStandardLazyResponse } from '@standardserver/fetch'
import { sendStandardResponse, toStandardLazyRequest } from '@standardserver/node'

export function createNodeHttpClientServerTest(): ClientServerTest {
  const handler: ClientServerTest['handler'] = vi.fn(async () => {
    return { status: 404, body: 'Not Found', headers: {} }
  })

  const serverErrorMap = new Map<string, unknown>()

  const server = http.createServer(async (req, res) => {
    try {
      const standardRequest = toStandardLazyRequest(req, res)
      const standardResponse = await handler(standardRequest)

      await sendStandardResponse(res, standardResponse)
    }
    catch (e) {
      const id = req.headers.id as string
      serverErrorMap.set(id, e)
      throw e
    }
  })

  server.listen(0)

  afterAll(() => {
    server.close()
  })

  const addressInfo = server.address() as AddressInfo

  const request: ClientServerTest['request'] = vi.fn(async (standardRequest) => {
    const id = crypto.randomUUID()

    try {
      const [body, headers] = toFetchBody(standardRequest.body, toFetchHeaders(standardRequest.headers))

      headers.set('id', id)

      const response = await fetch(`http://localhost:${addressInfo.port}${urlToString(standardRequest.url)}`, {
        method: standardRequest.method,
        headers,
        body: body ?? null,
        duplex: 'half',
        signal: standardRequest.signal ?? null,
      })

      if (serverErrorMap.has(id)) {
        throw serverErrorMap.get(id)
      }

      const standardResponse = toStandardLazyResponse(response)

      return standardResponse
    }
    finally {
      serverErrorMap.delete(id)
    }
  })

  return {
    handler,
    request,
  }
}
