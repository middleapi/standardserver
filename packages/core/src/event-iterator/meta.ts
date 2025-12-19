import type { EventMeta } from './types'
import { createEnhancedProxy, getPackageSymbol, isTypescriptObject } from '@standardserver/shared'
import { assertEventComment, assertEventId, assertEventRetry } from './encoder'

export const EVENT_SOURCE_META_SYMBOL = getPackageSymbol('EVENT_SOURCE_META')

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

  return createEnhancedProxy(container, {
    get(_target, prop, _receiver, fallback) {
      if (prop === EVENT_SOURCE_META_SYMBOL) {
        return meta
      }

      return fallback()
    },
  })
}

/**
 * Retrieves event meta information from the provided container.
 */
export function getEventMeta(container: unknown): EventMeta | undefined {
  if (!isTypescriptObject(container)) {
    return undefined
  }

  return Reflect.get(container, EVENT_SOURCE_META_SYMBOL) as EventMeta | undefined
}
