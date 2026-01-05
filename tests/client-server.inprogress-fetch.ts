import type { ClientServerTest } from './client-server'
import { toFetchBody, toFetchHeaders, toFetchResponse, toFetchUrl, toStandardLazyRequest, toStandardLazyResponse } from '@standardserver/fetch'

export function createInprogressFetchClientServerTest(): ClientServerTest {
  const handler: ClientServerTest['handler'] = vi.fn(async () => {
    return { status: 404, body: 'Not Found', headers: {} }
  })

  const request: ClientServerTest['request'] = vi.fn(async (standardRequest) => {
    const [body, headers] = toFetchBody(standardRequest.body, toFetchHeaders(standardRequest.headers))

    return toStandardLazyResponse(
      toFetchResponse(
        await handler(
          toStandardLazyRequest(
            new Request(toFetchUrl({ origin: 'http://placeholder', ...standardRequest }), {
              method: standardRequest.method,
              signal: standardRequest.signal ?? null,
              headers,
              body: body ?? null, // null = empty body
              duplex: 'half',
            }),
          ),
        ),
      ),
    )
  })

  return {
    handler,
    request,
  }
}
