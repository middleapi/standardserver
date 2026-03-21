export interface AsyncCleanupFn {
  (state: { isCancelled: boolean, error?: unknown }): Promise<void>
}
