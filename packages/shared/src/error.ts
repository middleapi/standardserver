/**
 * Error thrown when an operation is aborted.
 * Uses the standardized 'AbortError' name for consistency with JavaScript APIs.
 */
export class AbortError extends Error {
  constructor(...rest: ConstructorParameters<typeof Error>) {
    super(...rest)
    this.name = 'AbortError'
  }
}

/**
 * Forwards an error to the global unhandled rejection handler via a rejected Promise.
 * Useful for routing errors from sync contexts into async error pipelines.
 */
export function emitUnhandledRejection(error: unknown): void {
  Promise.reject(error).catch(() => {
    throw error
  })
}
