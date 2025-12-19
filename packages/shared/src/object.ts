/**
 * Checks whether the provided container is a typescript object (object or function).
 */
export function isTypescriptObject(maybeObject: unknown): maybeObject is object {
  if (!maybeObject) {
    return false
  }

  const type = typeof maybeObject
  return type === 'object' || type === 'function'
}
