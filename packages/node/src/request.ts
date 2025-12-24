import type { StandardLazyRequest } from '@standardserver/core'
import type { NodeHttpRequest, NodeHttpResponse } from './types'
import { toStandardBody } from './body'
import { toStandardMethod } from './method'
import { toAbortSignal } from './signal'
import { toStandardUrl } from './url'

export function toStandardLazyRequest(
  req: NodeHttpRequest,
  res: NodeHttpResponse,
): StandardLazyRequest {
  // DON'T lazy load signal, because we need register event listener as soon as possible
  // to make the signal abort in time
  const signal = toAbortSignal(res)

  return {
    ...toStandardUrl(req),
    method: toStandardMethod(req.method),
    headers: req.headers,
    body: hint => toStandardBody(req, { hint }),
    signal,
  }
}
