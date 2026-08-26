import type {
  ToEventStreamOptions as ToEventStreamOptionsFetch,
} from '@standardserver/fetch'
import type { AsyncIteratorClass } from '@standardserver/shared'
import { Readable } from 'node:stream'
import {
  toAsyncIteratorObject as toAsyncIteratorObjectFetch,
  toEventStream as toEventStreamFetch,
} from '@standardserver/fetch'
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
