export interface BetterProxyHandler<T extends object> extends Omit<ProxyHandler<T>, 'get'> {
  get: (target: T, p: PropertyKey, receiver: any, fallback: () => any) => any
}

/**
 * Creates a proxy for the given target object with enhanced behaviors:
 * - The `get` trap in the provided handler receives an additional `fallback` function,
 * which returns the value and auto-binds methods if needed.
 */
export function createEnhancedProxy<T extends object>(
  target: T,
  handler: BetterProxyHandler<T>,
): T {
  // eslint-disable-next-line ts/no-unsafe-function-type
  const boundMethods = new WeakMap<Function, Function>()

  return new Proxy(target, {
    ...handler,
    get(target, p, receiver) {
      return handler.get(target, p, receiver, () => {
        const value = Reflect.get(target, p)
        if (typeof value !== 'function') {
          return value
        }

        const cached = boundMethods.get(value)
        if (cached) {
          return cached
        }

        const boundMethod = value.bind(target)
        boundMethods.set(value, boundMethod)
        return boundMethod
      })
    },
  })
}
