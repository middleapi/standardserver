import { AsyncIteratorClass } from '@standardserver/shared'

export interface HibernationAsyncIteratorClassCallback {
  (id: string): void
}

export class HibernationAsyncIteratorClass<T, TReturn = unknown, TNext = unknown> extends AsyncIteratorClass<T, TReturn, TNext> {
  /**
   * Optional because `AsyncIteratorClass` does not define this property.
   * The client library represents server results as `AsyncIteratorClass` instances.
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
