import type { StandardResponse } from '@standardserver/core'
import type { ToNodeHttpBodyOptions } from './body'
import type { NodeHttpResponse } from './types'
import { toNodeHttpBody } from './body'
import { canWriteToNodeResponse } from './utils'

export interface SendStandardResponseOptions extends ToNodeHttpBodyOptions {
}

export async function sendStandardResponse(
  res: NodeHttpResponse,
  standardResponse: StandardResponse,
  options: SendStandardResponseOptions = {},
): Promise<void> {
  const [resBody, resHeaders] = await toNodeHttpBody(standardResponse.body, standardResponse.headers, options)

  return new Promise((resolve, reject) => {
    if (!canWriteToNodeResponse(res)) {
      if (typeof resBody === 'object' && !resBody.closed) {
        resBody.on('error', reject)
        resBody.destroy(res.errored ?? undefined)
      }

      if (res.errored) {
        reject(res.errored)
      }
      else {
        resolve()
      }

      return
    }

    res.once('error', reject)
    res.once('close', resolve)

    // DON'T use `res.writeHead` because it send response immediately in chunked mode
    // while we only need chunked if the response body is stream
    res.statusCode = standardResponse.status
    for (const key in resHeaders) {
      const value = resHeaders[key]
      if (value !== undefined) {
        res.setHeader(key, value)
      }
    }

    if (resBody === undefined) {
      // NOTE: Lambda functions don't allow passing undefined to `res.end`
      res.end()
    }
    else if (typeof resBody === 'string') {
      res.end(resBody)
    }
    else {
      res.once('close', () => {
        if (!resBody.closed) {
          resBody.destroy(res.errored ?? undefined)
        }
      })

      // WARNING: errors that occur here are silently ignored and not reported to the Promise
      resBody.once('error', error => res.destroy(error))

      resBody.pipe(res)
    }
  })
}
