export class EventEncoderError extends TypeError { }
export class EventDecoderError extends TypeError { }

export interface ErrorEventOptions extends ErrorOptions {
  message?: string
}

export class ErrorEvent extends Error {
  constructor(
    readonly data: unknown,
    options?: ErrorEventOptions,
  ) {
    super(options?.message ?? 'An error event was received', options)
  }
}
