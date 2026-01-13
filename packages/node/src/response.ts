import type { StandardResponse } from '@standardserver/core'
import type { ToNodeHttpBodyOptions } from './body'
import type { NodeHttpResponse } from './types'
import { toNodeHttpBody } from './body'

export interface SendStandardResponseOptions {
  /**
   * Options for converting the response body to a Node.js HTTP body.
   */
  body?: ToNodeHttpBodyOptions
}

export async function sendStandardResponse(
  res: NodeHttpResponse,
  standardResponse: StandardResponse,
  options: SendStandardResponseOptions = {},
): Promise<void> {
  const [resBody, resHeaders] = await toNodeHttpBody(standardResponse.body, standardResponse.headers, options.body)

  return new Promise((resolve, reject) => {
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
      // NOTE: some custom-runtime not allow pass undefined to `res.end`
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

      resBody.once('error', error => res.destroy(error))

      resBody.pipe(res)
    }
  })
}
