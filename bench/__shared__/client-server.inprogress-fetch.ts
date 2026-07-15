import type { ClientServer } from './client-server'
import { toFetchBody, toFetchHeaders, toFetchResponse, toStandardLazyRequest, toStandardLazyResponse } from '@standardserver/fetch'

/**
 * In-process fetch adapter path (Request/Response conversion) without a real network hop.
 */
export function createInprogressFetchClientServer(): ClientServer {
  const clientServer: ClientServer = {
    handler: async () => ({ status: 404, body: 'Not Found', headers: {} }),
    request: async (standardRequest) => {
      const [body, standardHeaders] = toFetchBody(standardRequest.body, standardRequest.headers)

      return toStandardLazyResponse(
        toFetchResponse(
          await clientServer.handler(
            toStandardLazyRequest(
              new Request(`http://localhost${standardRequest.url}`, {
                method: standardRequest.method,
                signal: standardRequest.signal ?? null,
                headers: toFetchHeaders(standardHeaders),
                body: body ?? null,
                duplex: 'half',
              }),
            ),
          ),
        ),
      )
    },
  }

  return clientServer
}
