import { AsyncIteratorClass } from '@standardserver/shared'

export interface HibernationAsyncIteratorClassCallback {
  (id: string): void
}

export class HibernationAsyncIteratorClass<T, TReturn = unknown, TNext = unknown> extends AsyncIteratorClass<T, TReturn, TNext> {
  /**
   * In the client library, server results are typically represented by an `AsyncIteratorClass`.
   * Since `AsyncIteratorClass` does not include a `hibernationCallback` property, this property should be optional.
   */
  readonly '~callback'?: HibernationAsyncIteratorClassCallback

  constructor(
    callback: HibernationAsyncIteratorClassCallback,
  ) {
    super(async () => {
      throw new Error('Cannot use hibernating iterator directly')
    }, async ({ kind }) => {
      if (kind === 'cancelled') {
        throw new Error('Cannot use hibernating iterator directly')
      }
    })

    this['~callback'] = callback
  }
}
