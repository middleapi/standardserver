import type Stream from 'node:stream'
import type { NodeHttpResponse } from './types'

/**
 * Check both the response itself and its underlying stream (http2) are still writable.
 */
export function canWriteToNodeResponse(res: Stream.Writable | NodeHttpResponse): boolean {
  if ('stream' in res && !_canWriteToStream(res.stream)) {
    return false
  }

  return _canWriteToStream(res)
}

function _canWriteToStream(stream: Stream.Writable): boolean {
  return !stream.closed && !stream.destroyed && !stream.writableFinished && !stream.writableEnded
}

/**
 * Get the error of the response, preferring its underlying stream's (http2).
 */
export function getNodeResponseError(res: Stream.Writable | NodeHttpResponse): Error | null {
  if ('stream' in res) {
    return res.stream.errored ?? res.errored ?? null
  }

  return res.errored
}
