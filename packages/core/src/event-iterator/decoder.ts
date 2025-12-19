import type { EventMessage } from './types'
import { EventDecoderError } from './error'

export function decodeEventMessage(encoded: string): EventMessage {
  const lines = encoded.replace(/\n+$/, '').split(/\n/)

  const message: EventMessage & { comments?: string[] } = {}

  for (const line of lines) {
    const index = line.indexOf(':')

    const key = index === -1
      ? line
      : line.slice(0, index)
    const value = index === -1
      ? ''
      : line.slice(index + 1).replace(/^\s/, '') // value may be prefixed by a single space https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation

    if (index === 0) { // comment starting with ':'
      message.comments ??= []
      message.comments.push(value)
    }

    else if (key === 'data') {
      if (message.data !== undefined) {
        // data can be sent in multiple lines if containing newlines
        // https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
        message.data += `\n${value}`
      }
      else {
        message.data = value
      }
    }

    else if (key === 'event') {
      message.event = value
    }

    else if (key === 'id') {
      message.id = value
    }

    else if (key === 'retry') {
      const maybeInteger = Number.parseInt(value)

      if (Number.isInteger(maybeInteger) && maybeInteger >= 0 && maybeInteger.toString() === value) {
        message.retry = maybeInteger
      }
    }
  }

  return message
}

export class EventDecoder {
  private incomplete: string = ''

  constructor(
    private readonly onEvent: (event: EventMessage) => void,
  ) {
  }

  feed(chunk: string): void {
    this.incomplete += chunk

    const lastCompleteIndex = this.incomplete.lastIndexOf('\n\n')

    if (lastCompleteIndex === -1) {
      return
    }

    const completes = this.incomplete.slice(0, lastCompleteIndex).split(/\n\n/)
    this.incomplete = this.incomplete.slice(lastCompleteIndex + 2)

    for (const encoded of completes) {
      const message = decodeEventMessage(`${encoded}\n\n`)
      this.onEvent(message)
    }

    this.incomplete = ''
  }

  end(): void {
    if (this.incomplete) {
      throw new EventDecoderError('Event Iterator ended before complete')
    }
  }
}

export class EventDecoderStream extends TransformStream<string, EventMessage> {
  constructor() {
    let decoder!: EventDecoder

    super({
      start(controller) {
        decoder = new EventDecoder((event) => {
          controller.enqueue(event)
        })
      },
      transform(chunk) {
        decoder.feed(chunk)
      },
      flush() {
        decoder.end()
      },
    })
  }
}
