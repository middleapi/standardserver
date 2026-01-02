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

      try {
        const result = await next()

        if (result.done) {
          this.isDone = true
        }

        return result
      }
      catch (err) {
        this.isDone = true
        throw err
      }
      finally {
        if (this.isDone && !this.isExecuteComplete) {
          this.isExecuteComplete = true
          await this.cleanup(true)
        }
      }
    })
  }

  async return(value?: any): Promise<IteratorResult<T, TReturn>> {
    this.isDone = true
    if (!this.isExecuteComplete) {
      this.isExecuteComplete = true
      await this.cleanup(false)
    }

    return { done: true, value }
  }

  async throw(err: any): Promise<IteratorResult<T, TReturn>> {
    this.isDone = true
    if (!this.isExecuteComplete) {
      this.isExecuteComplete = true
      await this.cleanup(false)
    }

    throw err
  }

  /**
   * asyncDispose symbol only available in esnext, we should fallback to Symbol.for('asyncDispose')
   */
  async [asyncDisposeSymbol](): Promise<void> {
    this.isDone = true
    if (!this.isExecuteComplete) {
      this.isExecuteComplete = true
      await this.cleanup(false)
    }
  }

  [Symbol.asyncIterator](): this {
    return this
  }
}
