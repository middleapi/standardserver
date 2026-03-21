import type { AsyncCleanupFn } from './types'
import { sequential } from './function'

export function isAsyncIteratorObject(maybe: unknown): maybe is AsyncIteratorObject<any, any, any> {
  if (!maybe || typeof maybe !== 'object') {
    return false
  }

  return 'next' in maybe && typeof maybe.next === 'function' && Symbol.asyncIterator in maybe && typeof maybe[Symbol.asyncIterator] === 'function'
}

export interface AsyncIteratorClassNextFn<T, TReturn> {
  (): Promise<IteratorResult<T, TReturn>>
}

const fallbackAsyncDisposeSymbol: unique symbol = Symbol.for('asyncDispose')
const asyncDisposeSymbol: typeof Symbol extends { asyncDispose: infer T } ? T : typeof fallbackAsyncDisposeSymbol = (Symbol as any).asyncDispose ?? fallbackAsyncDisposeSymbol

export class AsyncIteratorClass<T, TReturn = unknown, TNext = unknown> implements AsyncIteratorObject<T, TReturn, TNext>, AsyncGenerator<T, TReturn, TNext> {
  private isDone = false
  private isExecuteComplete = false
  private readonly cleanup: AsyncCleanupFn

  readonly next: AsyncIteratorClassNextFn<T, TReturn>

  constructor(next: AsyncIteratorClassNextFn<T, TReturn>, cleanup: AsyncCleanupFn) {
    this.cleanup = cleanup
    this.next = sequential(async () => {
      if (this.isDone) {
        return { done: true, value: undefined as any }
      }

      let errorRef: { value: unknown } | undefined

      try {
        const result = await next()

        if (result.done) {
          this.isDone = true
        }

        return result
      }
      catch (error) {
        errorRef = { value: error }
        this.isDone = true

        throw error
      }
      finally {
        if (this.isDone && !this.isExecuteComplete) {
          this.isExecuteComplete = true
          await this.cleanup(errorRef ? { isCancelled: false, error: errorRef.value } : { isCancelled: false })
        }
      }
    })
  }

  async return(value?: any): Promise<IteratorResult<T, TReturn>> {
    this.isDone = true
    if (!this.isExecuteComplete) {
      this.isExecuteComplete = true
      await this.cleanup({ isCancelled: true })
    }

    return { done: true, value }
  }

  async throw(error: any): Promise<IteratorResult<T, TReturn>> {
    this.isDone = true

    if (!this.isExecuteComplete) {
      this.isExecuteComplete = true
      await this.cleanup({ isCancelled: true, error })
    }

    throw error
  }

  /**
   * asyncDispose symbol only available in esnext, we should fallback to Symbol.for('asyncDispose')
   */
  async [asyncDisposeSymbol](): Promise<void> {
    this.isDone = true
    if (!this.isExecuteComplete) {
      this.isExecuteComplete = true
      await this.cleanup({ isCancelled: true })
    }
  }

  [Symbol.asyncIterator](): this {
    return this
  }
}
