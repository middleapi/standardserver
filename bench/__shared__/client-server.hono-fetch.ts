import type { AddressInfo } from 'node:net'
import type { ClientServer } from './client-server'
import { serve } from '@hono/node-server'
import { toFetchBody, toFetchHeaders, toFetchResponse, toStandardLazyRequest, toStandardLazyResponse } from '@standardserver/fetch'

/**
 * Real Hono/node-server + fetch adapter round-trip.
 */
export function createHonoFetchClientServer(): ClientServer {
  const clientServer: ClientServer = {
    handler: async () => ({ status: 404, body: 'Not Found', headers: {} }),
    request: async () => {
      throw new Error('client-server not ready')
    },
  }

  const server = serve({
    fetch: async (request: Request) => {
      const standardRequest = toStandardLazyRequest(request)
      const standardResponse = await clientServer.handler(standardRequest)
      return toFetchResponse(standardResponse)
    },
    port: 0,
  })

  afterAll(() => {
    server.close()
  })

  const addressInfo = server.address() as AddressInfo

  clientServer.request = async (standardRequest) => {
    const [body, standardHeaders] = toFetchBody(standardRequest.body, standardRequest.headers)

    const init: RequestInit = {
      method: standardRequest.method,
      signal: standardRequest.signal ?? null,
      headers: toFetchHeaders(standardHeaders),
      body: body ?? null,
    }

    if (body instanceof ReadableStream) {
      init.duplex = 'half'
    }

    const response = await fetch(`http://localhost:${addressInfo.port}${standardRequest.url}`, init)

    return toStandardLazyResponse(response)
  }

  return clientServer
}
