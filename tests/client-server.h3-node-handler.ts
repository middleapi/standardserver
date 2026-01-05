import type { ClientServerTest } from './client-server'
import { toFetchBody, toFetchHeaders, toFetchUrl, toStandardLazyResponse } from '@standardserver/fetch'
import { sendStandardResponse, toStandardLazyRequest } from '@standardserver/node'
import { fromNodeHandler, H3, serve } from 'h3'

export function createH3NodeHandlerClientServerTest(): ClientServerTest {
  const handler: ClientServerTest['handler'] = vi.fn(async () => {
    return { status: 404, body: 'Not Found', headers: {} }
  })

  const serverErrorMap = new Map<string, unknown>()

  const app = new H3()

  app.all('/*', fromNodeHandler(async (req, res) => {
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
  }))

  const server = serve(app, { port: 0 })

  afterAll(() => {
    server.close()
  })

  const port = server.url!.split(':').pop()!.split('/').shift()!

  const request: ClientServerTest['request'] = vi.fn(async (standardRequest) => {
    const id = crypto.randomUUID()

    try {
      const [body, headers] = toFetchBody(standardRequest.body, toFetchHeaders(standardRequest.headers))

      headers.set('id', id)

      const response = await fetch(toFetchUrl({
        ...standardRequest,
        origin: `http://localhost:${port}`,
      }), {
        method: standardRequest.method,
        signal: standardRequest.signal ?? null,
        headers,
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
