// eslint-disable-next-line ts/no-unsafe-function-type
const GET_OR_BIND_CACHE = new WeakMap<Function, WeakMap<object, Function>>()

export function getOrBind<T extends object, K extends PropertyKey>(target: T, property: K): K extends keyof T ? T[K] : unknown {
  // eslint-disable-next-line ban/ban
  const value = Reflect.get(target, property)

  if (typeof value !== 'function') {
    return value
  }

  let targetCache = GET_OR_BIND_CACHE.get(value)
  if (!targetCache) {
    GET_OR_BIND_CACHE.set(value, (targetCache = new WeakMap()))
  }

  let bound = targetCache.get(target)
  if (!bound) {
    targetCache.set(target, (bound = value.bind(target)))
  }

  return bound as any
}
