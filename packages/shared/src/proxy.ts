// eslint-disable-next-line ts/no-unsafe-function-type
const GET_OR_BIND_CACHE = new WeakMap<object, WeakMap<Function, Function>>()

export function getOrBind<T extends object, K extends PropertyKey>(target: T, property: K): K extends keyof T ? T[K] : unknown {
  const value = Reflect.get(target, property)
  if (typeof value !== 'function') {
    return value
  }

  let cache = GET_OR_BIND_CACHE.get(target)
  if (!cache) {
    cache = new WeakMap()
    GET_OR_BIND_CACHE.set(target, cache)
  }

  const cached = cache.get(value)
  if (cached) {
    return cached as any
  }

  const bound = value.bind(target)
  cache.set(value, bound)
  return bound as any
}
