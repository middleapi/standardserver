export class EventStreamEncoderError extends TypeError { }
export class EventStreamDecoderError extends TypeError { }

export interface EventIteratorErrorEventOptions extends ErrorOptions {
  message?: string
}

export class EventIteratorErrorEvent extends Error {
  constructor(
    readonly data: unknown,
    options: EventIteratorErrorEventOptions = {},
  ) {
    super(options?.message ?? 'Error Event', options)
  }
}
