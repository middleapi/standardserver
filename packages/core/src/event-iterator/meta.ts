import type { EventMeta } from './types'
import { getPackageSymbol } from '../consts'
import { assertEventComment, assertEventId, assertEventRetry } from './encoder'

export const EVENT_SOURCE_META_SYMBOL = getPackageSymbol('EVENT_SOURCE_META')

/**
 * Checks whether the provided container can hold event meta information.
 */
export function isEventMetaContainer(container: unknown): container is object {
  if (!container) {
    return false
  }

  const type = typeof container
  return type === 'object' || type === 'function'
}

/**
 * Attaches event meta information to the provided container.
 *
 * @info The returned container is a proxy that intercepts access to the meta symbol.
 */
export function withEventMeta<T extends object>(container: T, meta: EventMeta): T {
  // avoid proxy overhead if no meta is set
  if (
    meta.id === undefined
    && meta.retry === undefined
    && !meta.comments?.length
  ) {
    return container
  }

  if (meta.id !== undefined) {
    assertEventId(meta.id)
  }

  if (meta.retry !== undefined) {
    assertEventRetry(meta.retry)
  }

  if (meta.comments !== undefined) {
    for (const comment of meta.comments) {
      assertEventComment(comment)
    }
  }

  return new Proxy(container, {
    get(target, prop, receiver) {
      if (prop === EVENT_SOURCE_META_SYMBOL) {
        return meta
      }
      // @todo - some instance require method to bind to the proxy target before returning
      return Reflect.get(target, prop, receiver)
    },
  })
}

/**
 * Retrieves event meta information from the provided container.
 */
export function getEventMeta(container: unknown): EventMeta | undefined {
  if (!isEventMetaContainer(container)) {
    return undefined
  }

  return Reflect.get(container, EVENT_SOURCE_META_SYMBOL) as EventMeta | undefined
}
