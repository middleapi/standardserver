import type { ClientServerTest } from './client-server'
import { urlToString } from '@standardserver/core'
import { toFetchBody, toFetchHeaders, toFetchResponse, toStandardLazyRequest, toStandardLazyResponse } from '@standardserver/fetch'
import { fromWebHandler, H3, serve } from 'h3'

export function createH3WebHandlerClientServerTest(): ClientServerTest {
  const handler: ClientServerTest['handler'] = vi.fn(async () => {
    return { status: 404, body: 'Not Found', headers: {} }
  })

  const serverErrorMap = new Map<string, unknown>()

  const app = new H3()

  app.all('/*', fromWebHandler(async (request) => {
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

  const server = serve(app, { port: 0 })

  afterAll(() => {
    server.close()
  })

  const port = server.url!.split(':').pop()!.split('/').shift()!

  const request: ClientServerTest['request'] = vi.fn(async (standardRequest) => {
    const id = crypto.randomUUID()

    try {
      const [body, standardHeaders] = toFetchBody(standardRequest.body, standardRequest.headers)

      standardHeaders.id = id

      const response = await fetch(`http://localhost:${port}${urlToString(standardRequest.url)}`, {
        method: standardRequest.method,
        signal: standardRequest.signal ?? null,
        headers: toFetchHeaders(standardHeaders),
        body: body ?? null,
        duplex: 'half',
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
