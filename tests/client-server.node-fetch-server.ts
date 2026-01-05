import type { AddressInfo } from 'node:net'
import type { ClientServerTest } from './client-server'
import * as http from 'node:http'
import { createRequestListener } from '@mjackson/node-fetch-server'
import { toFetchBody, toFetchHeaders, toFetchResponse, toFetchUrl, toStandardLazyRequest, toStandardLazyResponse } from '@standardserver/fetch'

export function createNodeFetchServerClientServerTest(): ClientServerTest {
  const handler: ClientServerTest['handler'] = vi.fn(async () => {
    return { status: 404, body: 'Not Found', headers: {} }
  })

  const serverErrorMap = new Map<string, unknown>()

  const server = http.createServer(createRequestListener(async (request: Request) => {
    try {
      const standardRequest = toStandardLazyRequest(request)
      const standardResponse = await handler(standardRequest)
      const response = toFetchResponse(standardResponse)

      return response
    }
    catch (e) {
      const id = request.headers.get('id')!
      serverErrorMap.set(id, e)
      throw e
    }
  }))

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

      const response = await fetch(toFetchUrl({
        ...standardRequest,
        origin: `http://localhost:${addressInfo.port}`,
      }), {
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
