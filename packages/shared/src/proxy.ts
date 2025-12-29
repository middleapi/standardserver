import { getPackageSymbol } from './consts'

const ENHANCED_PROXY_TARGET_SYMBOL = getPackageSymbol('ENHANCED_PROXY_TARGET')

/**
 * A ProxyHandler whose `get` trap receives an additional `fallback` function.
 *
 * The `fallback` returns the default property value as if no proxy
 * interception occurred, and automatically binds methods to the target.
 */
export interface EnhancedProxyHandler<T extends object> extends Omit<ProxyHandler<T>, 'get'> {
  get(target: T, p: PropertyKey, receiver: any, fallback: () => any): any
}

/**
 * Creates a Proxy that enhances the standard `get` trap by providing:
 *
 * - A `fallback` function that:
 *   - Reads the property directly from the target
 *   - Automatically binds methods to the target
 *   - Caches bound methods for stable identity
 * - An internal symbol that allows accessing the original target
 */
export function createEnhancedProxy<T extends object>(
  target: T,
  handler: EnhancedProxyHandler<T>,
): T {
  // eslint-disable-next-line ts/no-unsafe-function-type
  const boundMethodCache = new WeakMap<Function, Function>()

  return new Proxy(target, {
    ...handler,
    get(target, p, receiver) {
      if (p === ENHANCED_PROXY_TARGET_SYMBOL) {
        return target
      }

      return handler.get(target, p, receiver, () => {
        const value = Reflect.get(target, p)
        if (typeof value !== 'function') {
          return value
        }

        const cached = boundMethodCache.get(value)
        if (cached) {
          return cached
        }

        const bound = value.bind(target)
        boundMethodCache.set(value, bound)
        return bound
      })
    },
  })
}

/**
 * Returns the underlying target of an enhanced proxy.
 * If the given value is not an enhanced proxy, it is returned as-is.
 */
export function getEnhancedProxyTarget<T extends object>(value: T): T {
  return (value as any)[ENHANCED_PROXY_TARGET_SYMBOL] ?? value
}
