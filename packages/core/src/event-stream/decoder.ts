import type { EventStreamMessage } from './types'
import { EventStreamDecoderError } from './error'

export function decodeEventStreamMessage(encoded: string): EventStreamMessage {
  const lines = encoded.replace(/\n+$/, '').split(/\n/)

  const message: EventStreamMessage & { comments?: string[] } = {}

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

export class EventStreamDecoder {
  private incomplete: string = ''

  constructor(
    private readonly onEvent: (event: EventStreamMessage) => void,
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
      const message = decodeEventStreamMessage(`${encoded}\n\n`)
      this.onEvent(message)
    }
  }

  end(): void {
    if (this.incomplete) {
      throw new EventStreamDecoderError('Event Stream ended before complete')
    }
  }
}

export class EventStreamDecoderStream extends TransformStream<string, EventStreamMessage> {
  constructor() {
    let decoder!: EventStreamDecoder

    super({
      start(controller) {
        decoder = new EventStreamDecoder((event) => {
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
