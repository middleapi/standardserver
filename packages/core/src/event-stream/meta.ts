import type { EventStreamMessageMeta } from './types'
import { getOrBind, getPackageSymbol, isTypescriptObject } from '@standardserver/shared'
import { assertEventStreamMessageComment, assertEventStreamMessageId, assertEventStreamMessageRetry } from './encoder'

export const EVENT_ITERATOR_EVENT_META_SYMBOL = getPackageSymbol('EVENT_ITERATOR_EVENT_META')
export const EVENT_ITERATOR_EVENT_SOURCE_SYMBOL = getPackageSymbol('EVENT_ITERATOR_EVENT_SOURCE')

/**
 * Returns a new iterator *event value* with attached, validated metadata.
 */
export function withEventIteratorEventMeta<T extends object>(container: T, meta: EventStreamMessageMeta): T {
  let assertedMeta: EventStreamMessageMeta | undefined
  if (meta.id !== undefined) {
    assertEventStreamMessageId(meta.id)
    assertedMeta ??= {}
    assertedMeta.id = meta.id
  }

  if (meta.retry !== undefined) {
    assertEventStreamMessageRetry(meta.retry)
    assertedMeta ??= {}
    assertedMeta.retry = meta.retry
  }

  if (meta.comments !== undefined) {
    for (const comment of meta.comments) {
      assertEventStreamMessageComment(comment)
    }
    assertedMeta ??= {}
    assertedMeta.comments = meta.comments
  }

  // avoid proxy creation if no meta is asserted
  if (!assertedMeta) {
    return container
  }

  return new Proxy(container, {
    get(target, prop, _receiver) {
      if (prop === EVENT_ITERATOR_EVENT_SOURCE_SYMBOL) {
        return target
      }

      if (prop === EVENT_ITERATOR_EVENT_META_SYMBOL) {
        return assertedMeta
      }

      return getOrBind(target, prop)
    },
  })
}

/**
 * Unwraps an iterator event value and extracts its associated metadata.
 */
export function unwrapEventIteratorEvent<T>(container: T): [data: T, meta: EventStreamMessageMeta | undefined] {
  if (!isTypescriptObject(container)) {
    return [container, undefined]
  }

  const meta = Reflect.get(container, EVENT_ITERATOR_EVENT_META_SYMBOL) as EventStreamMessageMeta | undefined
  const target = Reflect.get(container, EVENT_ITERATOR_EVENT_SOURCE_SYMBOL) as T ?? container

  return [target, meta]
}

/**
 * Retrieves metadata attached to a single iterator event value.
 */
export function getEventIteratorEventMeta(container: unknown): EventStreamMessageMeta | undefined {
  if (!isTypescriptObject(container)) {
    return undefined
  }

  return Reflect.get(container, EVENT_ITERATOR_EVENT_META_SYMBOL) as EventStreamMessageMeta | undefined
}
