/**
 * Checks whether the provided container is a typescript object (object or function).
 */
export function isTypescriptObject(maybeObject: unknown): maybeObject is object & Record<PropertyKey, unknown> {
  if (!maybeObject) {
    return false
  }

  const type = typeof maybeObject
  return type === 'object' || type === 'function'
}

/**
 *  Creates a new object with the specified keys omitted.
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj }
  for (const key of keys) {
    delete result[key]
  }
  return result
}
