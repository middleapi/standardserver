import type {
  ToEventStreamOptions as BaseToEventStreamOptions,
} from '@standardserver/fetch'
import type { AsyncIteratorClass } from '@standardserver/shared'
import { Readable } from 'node:stream'
import {
  toEventIterator as baseToEventIterator,
  toEventStream as baseToEventStream,
} from '@standardserver/fetch'

export function toEventIterator(
  stream: Readable,
): AsyncIteratorClass<unknown> {
  return baseToEventIterator(Readable.toWeb(stream))
}

export interface ToEventStreamOptions extends BaseToEventStreamOptions {}

export function toEventStream(
  iterator: AsyncIterator<unknown | void, unknown | void, void>,
  options: ToEventStreamOptions = {},
): Readable {
  return Readable.fromWeb(baseToEventStream(iterator, options))
}
