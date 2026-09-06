import type {
  ToEventStreamOptions as ToEventStreamOptionsFetch,
} from '@standard-server/fetch'
import type { AsyncIteratorClass } from '@standard-server/shared'
import { Readable } from 'node:stream'
import {
  toAsyncIteratorObject as toAsyncIteratorObjectFetch,
  toEventStream as toEventStreamFetch,
} from '@standard-server/fetch'
import { toWebReadableStream } from './utils'

export function toAsyncIteratorObject(
  stream: Readable,
): AsyncIteratorClass<unknown> {
  return toAsyncIteratorObjectFetch(toWebReadableStream(stream))
}

export interface ToEventStreamOptions extends ToEventStreamOptionsFetch {}

export function toEventStream(
  iterator: AsyncIterator<unknown | void, unknown | void, void>,
  options: ToEventStreamOptions = {},
): Readable {
  return Readable.fromWeb(toEventStreamFetch(iterator, options))
}
