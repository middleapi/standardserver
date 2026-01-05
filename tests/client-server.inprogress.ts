import type { ClientServerTest } from './client-server'

export function createInprogressClientServerTest(): ClientServerTest {
  const handler: ClientServerTest['handler'] = vi.fn(async () => {
    return { status: 404, body: 'Not Found', headers: {} }
  })

  const request: ClientServerTest['request'] = vi.fn(async (standardRequest) => {
    const standardResponse = await handler({ ...standardRequest, body: async () => standardRequest.body })
    return { ...standardResponse, body: async () => standardResponse.body }
  })

  return {
    handler,
    request,
  }
}
