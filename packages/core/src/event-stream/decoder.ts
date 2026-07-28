import type { EventStreamMessage } from './types'
import { EventStreamDecoderError } from './error'

// A line ending is CR, LF or CRLF. The lookahead stops a CR from matching on
// its own when it is really the first half of a CRLF pair — without it,
// `{2}` would backtrack and treat a single '\r\n' as a message delimiter.
const LINE_ENDING_REGEX = /\r\n|\r(?!\n)|\n/
const MESSAGE_DELIMITER_REGEX = /(?:\r\n|\r(?!\n)|\n){2}/g

// A delimiter is at most 4 characters ('\r\n\r\n'), so one crossing a chunk
// boundary must start within the last 3 characters of what came before.
const MAX_DELIMITER_OVERLAP = 3

const CR = 0x0D
const LF = 0x0A
const SPACE = 0x20

export function decodeEventStreamMessage(encoded: string): EventStreamMessage {
  const message: EventStreamMessage & { comments?: string[] } = {}

  for (const line of encoded.split(LINE_ENDING_REGEX)) {
    if (line === '') {
      continue
    }

    const index = line.indexOf(':')

    // The value may be prefixed by a single space
    // https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
    const value = index === -1
      ? ''
      : line.slice(line.charCodeAt(index + 1) === SPACE ? index + 2 : index + 1)

    if (index === 0) { // comment starting with ':'
      (message.comments ??= []).push(value)
      continue
    }

    switch (index === -1 ? line : line.slice(0, index)) {
      case 'data':
        // data can be sent in multiple lines if containing newlines
        // https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
        message.data = message.data === undefined
          ? value
          : `${message.data}\n${value}`
        break

      case 'event':
        message.event = value
        break

      case 'id':
        message.id = value
        break

      case 'retry': {
        const maybeInteger = Number.parseInt(value, 10)

        // The round-trip check already rejects NaN, signs, padding and floats.
        if (maybeInteger >= 0 && maybeInteger.toString() === value) {
          message.retry = maybeInteger
        }
        break
      }
    }
  }

  return message
}

export class EventStreamDecoder {
  private pending: string[] = []
  // Last up-to-3 characters of the pending buffer, prefixed to the next chunk
  // so a delimiter straddling the boundary is still found.
  private tail: string = ''
  // Set when a chunk-ending '\r' was already consumed as a line ending, so a
  // leading '\n' in the next chunk is the second half of that CRLF pair.
  private discardLeadingLF: boolean = false

  constructor(
    private readonly onEvent: (event: EventStreamMessage) => void,
  ) {
  }

  feed(chunk: string): void {
    // An empty chunk carries no stream characters, so it must not close the
    // discard window: the next stream character may still be the LF half of an
    // already-consumed CRLF pair.
    if (chunk === '') {
      return
    }

    if (this.discardLeadingLF) {
      this.discardLeadingLF = false

      if (chunk.charCodeAt(0) === LF) {
        chunk = chunk.slice(1)

        if (chunk === '') {
          return
        }
      }
    }

    // Everything before `tail` was scanned by an earlier feed and holds no
    // delimiter, so only this window needs scanning — even when messages
    // complete, the joined buffer is only sliced, never re-scanned.
    const scan = this.tail + chunk
    MESSAGE_DELIMITER_REGEX.lastIndex = 0
    let match = MESSAGE_DELIMITER_REGEX.exec(scan)

    if (match === null) {
      this.pending.push(chunk)
      this.tail = scan.slice(-MAX_DELIMITER_OVERLAP)
      return
    }

    this.pending.push(chunk)
    const buffered = this.pending.length === 1 ? chunk : this.pending.join('')
    // `scan` is a suffix of `buffered`; this maps scan indexes onto it.
    const offset = buffered.length - scan.length

    const parts: string[] = []
    let start = 0

    do {
      parts.push(buffered.slice(start, offset + match.index))
      start = offset + MESSAGE_DELIMITER_REGEX.lastIndex
      match = MESSAGE_DELIMITER_REGEX.exec(scan)
    } while (match !== null)

    const incomplete = buffered.slice(start)

    // All state is settled before emitting so `onEvent` may safely re-enter
    // `feed`, which shares MESSAGE_DELIMITER_REGEX's lastIndex.
    this.pending.length = 0
    this.tail = incomplete.slice(-MAX_DELIMITER_OVERLAP)

    if (incomplete === '') {
      // A chunk-ending '\r' consumed as the delimiter's last line ending may
      // still be completed into a CRLF by a '\n' opening the next chunk.
      this.discardLeadingLF = chunk.charCodeAt(chunk.length - 1) === CR
    }
    else {
      this.pending.push(incomplete)
    }

    for (const encoded of parts) {
      this.onEvent(decodeEventStreamMessage(encoded))
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
