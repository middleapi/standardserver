import type { EventStreamMessage } from './types'
import { EventStreamDecoderError } from './error'

const EVENT_STREAM_LINE_DELIMITER_REGEX = /\r\n|[\n\r]/
const EVENT_STREAM_DELIMITER_REGEX = /(?:\r\n|\r(?!\n)|\n)(?:\r\n|\r(?!\n)|\n)/
const LEADING_WHITESPACE_REGEX = /^\s/

export function decodeEventStreamMessage(encoded: string): EventStreamMessage {
  const lines = encoded.split(EVENT_STREAM_LINE_DELIMITER_REGEX)

  const message: EventStreamMessage & { comments?: string[] } = {}

  for (const line of lines) {
    const index = line.indexOf(':')

    const key = index === -1
      ? line
      : line.slice(0, index)
    const value = index === -1
      ? ''
      : line.slice(index + 1).replace(LEADING_WHITESPACE_REGEX, '') // value may be prefixed by a single space https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation

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
  private pending: string[] = []
  // Last up-to-3 characters of the pending buffer. A delimiter is at most 4
  // characters ('\r\n\r\n'), so one crossing a chunk boundary must start here.
  private tail: string = ''
  private trailingCR: boolean = false

  constructor(
    private readonly onEvent: (event: EventStreamMessage) => void,
  ) {
  }

  feed(chunk: string): void {
    // If the previous chunk ended with a '\r' that was already consumed as a
    // line ending, a leading '\n' in this chunk is the second half of that CRLF
    // pair and must be discarded. If the '\r' is still buffered, keep the '\n'
    // so the pair naturally reads as a single CRLF line ending.
    if (this.trailingCR && chunk.startsWith('\n') && !this.tail.endsWith('\r')) {
      chunk = chunk.slice(1)
    }

    this.trailingCR = chunk.endsWith('\r')

    if (chunk === '') {
      return
    }

    const scan = this.tail + chunk

    if (!EVENT_STREAM_DELIMITER_REGEX.test(scan)) {
      this.pending.push(chunk)
      this.tail = scan.length > 3 ? scan.slice(-3) : scan
      return
    }

    this.pending.push(chunk)
    const buffered = this.pending.length === 1 ? chunk : this.pending.join('')

    const parts = buffered.split(EVENT_STREAM_DELIMITER_REGEX)
    const incomplete = parts.pop()!

    this.pending.length = 0
    this.tail = incomplete.length > 3 ? incomplete.slice(-3) : incomplete
    if (incomplete !== '') {
      this.pending.push(incomplete)
    }

    for (const encoded of parts) {
      const message = decodeEventStreamMessage(encoded)
      this.onEvent(message)
    }
  }

  end(): void {
    if (this.pending.length !== 0) {
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
