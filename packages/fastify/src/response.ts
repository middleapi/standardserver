import type { StandardResponse } from '@standardserver/core'
import type { ToNodeHttpBodyOptions } from '@standardserver/node'
import type { AnyFastifyReply } from './types'
import { canWriteToNodeResponse, getNodeResponseError, toNodeHttpBody } from '@standardserver/node'

export interface SendStandardResponseOptions extends ToNodeHttpBodyOptions {
}

export async function sendStandardResponse(
  reply: AnyFastifyReply,
  standardResponse: StandardResponse,
  options: SendStandardResponseOptions = {},
): Promise<void> {
  const [resBody, resHeaders] = await toNodeHttpBody(standardResponse.body, standardResponse.headers, options)

  return new Promise((resolve, reject) => {
    if (!canWriteToNodeResponse(reply.raw)) {
      const error = getNodeResponseError(reply.raw)

      if (typeof resBody === 'object' && !resBody.closed) {
        resBody.on('error', reject)
        resBody.destroy(error ?? undefined)
      }

      if (error) {
        reject(error)
      }
      else {
        resolve()
      }

      return
    }

    reply.raw.once('error', reject)
    reply.raw.once('close', resolve)

    reply.status(standardResponse.status)

    // DON'T pass headers with `undefined` value to fastify, it turns them into empty strings
    for (const key in resHeaders) {
      const value = resHeaders[key]
      if (value !== undefined) {
        reply.header(key, value)
      }
    }

    // fastify pipes and cleans up the stream body itself, no manual piping needed
    reply.send(resBody)
  })
}
