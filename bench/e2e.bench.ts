import { bench, describe } from 'vitest'
import { echoHandler, roundTrip } from './__shared__/client-server'
import { createHonoFetchClientServer } from './__shared__/client-server.hono-fetch'
import { createInprogressFetchClientServer } from './__shared__/client-server.inprogress-fetch'
import { createMessagePortClientServer } from './__shared__/client-server.message-port'
import { createNodeHttpClientServer } from './__shared__/client-server.node-http'
import { createNodeWsClientServer } from './__shared__/client-server.node-ws'
import { asEventStream, asOctetStream, BODY_PAYLOADS, BODY_SIZE_ENTRIES } from './__shared__/payloads'

const adapters = [
  ['inprogress-fetch', createInprogressFetchClientServer],
  ['node-http', createNodeHttpClientServer],
  ['hono-fetch', createHonoFetchClientServer],
  ['message-port', createMessagePortClientServer],
  ['node-ws', createNodeWsClientServer],
] as const

describe.each(adapters)('e2e client-server: $0', async (_, create) => {
  const clientServer = create()
  clientServer.handler = echoHandler
  await roundTrip(clientServer, { method: 'GET', url: '/', headers: {} })

  describe.each(BODY_SIZE_ENTRIES)('body size $0', (label) => {
    const payloads = BODY_PAYLOADS[label]

    bench('json', async () => {
      await roundTrip(clientServer, {
        method: 'POST',
        url: `/${label}/json`,
        headers: {},
        body: payloads.json,
      })
    })

    bench('blob', async () => {
      await roundTrip(clientServer, {
        method: 'POST',
        url: `/${label}/blob`,
        headers: {},
        body: payloads.blob,
      })
    })

    bench('mixed formData', async () => {
      await roundTrip(clientServer, {
        method: 'POST',
        url: `/${label}/form-data`,
        headers: {},
        body: payloads.formData,
      })
    })

    bench('url search params', async () => {
      await roundTrip(clientServer, {
        method: 'POST',
        url: `/${label}/url-search-params`,
        headers: {},
        body: payloads.urlSearchParams,
      })
    })

    bench('event stream', async () => {
      await roundTrip(clientServer, {
        method: 'POST',
        url: `/${label}/event-stream`,
        headers: {},
        body: asEventStream(payloads.eventParts),
      })
    })

    bench('octet stream', async () => {
      await roundTrip(clientServer, {
        method: 'POST',
        url: `/${label}/octet-stream`,
        headers: {},
        body: asOctetStream(payloads.octetParts),
      })
    })
  })
})
