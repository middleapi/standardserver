import type { EventStreamMessageMeta } from './types'
import { createEnhancedProxy, getEnhancedProxyTarget, getPackageSymbol, isTypescriptObject } from '@standardserver/shared'
import { assertEventStreamMessageComment, assertEventStreamMessageId, assertEventStreamMessageRetry } from './encoder'

export const EVENT_META_SYMBOL = getPackageSymbol('EVENT_META')

/**
 * Attaches event meta information to the provided container.
 *
 * @info The returned container is a proxy that intercepts access to the meta symbol.
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

  return createEnhancedProxy(container, {
    get(_target, prop, _receiver, fallback) {
      if (prop === EVENT_META_SYMBOL) {
        return assertedMeta
      }

      return fallback()
    },
  })
}

/**
 * Resolves the event meta information from the provided container.
 */
export function resolveEventIteratorEvent<T>(container: T): [data: T, meta: EventStreamMessageMeta | undefined] {
  if (!isTypescriptObject(container)) {
    return [container, undefined]
  }

  const meta = Reflect.get(container, EVENT_META_SYMBOL) as EventStreamMessageMeta | undefined
  const target = getEnhancedProxyTarget(container)

  return [target, meta]
}

/**
 * Retrieves event meta information from the provided container.
 */
export function getEventIteratorEventMeta(container: unknown): EventStreamMessageMeta | undefined {
  if (!isTypescriptObject(container)) {
    return undefined
  }

  return Reflect.get(container, EVENT_META_SYMBOL) as EventStreamMessageMeta | undefined
}
