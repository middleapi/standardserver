import type { StandardLazyRequest } from '@standardserver/core'
import type { AnyFastifyReply, AnyFastifyRequest } from './types'
import { toAbortSignal, toStandardBody, toStandardMethod, toStandardUrl } from '@standardserver/node'

export function toStandardLazyRequest(
  req: AnyFastifyRequest,
  reply: AnyFastifyReply,
): StandardLazyRequest {
  // DON'T lazy load signal, because we need register event listener as soon as possible
  // to make the signal abort in time
  const signal = toAbortSignal(reply.raw)

  return {
    url: toStandardUrl(req.raw),
    method: toStandardMethod(req.raw.method),
    headers: req.headers,
    resolveBody: async (hint) => {
      // prefer the body fastify already parsed with its own content type parsers
      if (req.body !== undefined) {
        return req.body
      }

      return toStandardBody(req.raw, { hint })
    },
    signal,
  }
}
