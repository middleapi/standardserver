import { AsyncIteratorClass } from '@standardserver/shared'

export interface HibernationEventIteratorCallback {
  (id: string): void
}

export class HibernationEventIterator<T, TReturn = unknown, TNext = unknown> extends AsyncIteratorClass<T, TReturn, TNext> {
  /**
   * In the client library, server results are typically represented by an `AsyncIteratorClass`.
   * Since `AsyncIteratorClass` does not include a `hibernationCallback` property, this property should be optional.
   */
  readonly hibernationCallback?: HibernationEventIteratorCallback

  constructor(
    hibernationCallback: HibernationEventIteratorCallback,
  ) {
    super(async () => {
      throw new Error('Cannot use hibernating iterator directly')
    }, async ({ kind }) => {
      if (kind === 'cancelled') {
        throw new Error('Cannot use hibernating iterator directly')
      }
    })

    this.hibernationCallback = hibernationCallback
  }
}
