export interface AsyncCleanupFn {
  (isCompleted: boolean): Promise<void>
}
