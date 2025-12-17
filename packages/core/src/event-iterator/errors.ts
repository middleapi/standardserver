export class EventEncoderError extends TypeError { }
export class EventDecoderError extends TypeError { }

export interface ErrorEventOptions extends ErrorOptions {
  message?: string
  data?: unknown
}

export class ErrorEvent extends Error {
  public data: unknown

  constructor(options?: ErrorEventOptions) {
    super(options?.message ?? 'An error event was received', options)

    this.data = options?.data
  }
}
