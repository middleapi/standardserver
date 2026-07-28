import type { EventStreamMessage } from './types'
import { EventStreamEncoderError } from './error'

const EVENT_STREAM_LINE_ENDING_REGEX = /\r\n|[\n\r]/
const EVENT_STREAM_LINE_ENDING_GLOBAL_REGEX = /\r\n|[\n\r]/g

function containsEventStreamLineBreak(value: string): boolean {
  return EVENT_STREAM_LINE_ENDING_REGEX.test(value)
}

export function assertEventStreamMessageId(id: string): void {
  if (containsEventStreamLineBreak(id)) {
    throw new EventStreamEncoderError('Event\'s id must not contain a carriage return or newline character')
  }
}

export function assertEventStreamMessageName(event: string): void {
  if (containsEventStreamLineBreak(event)) {
    throw new EventStreamEncoderError('Event\'s event must not contain a carriage return or newline character')
  }
}

export function assertEventStreamMessageRetry(retry: number): void {
  if (!Number.isInteger(retry) || retry < 0) {
    throw new EventStreamEncoderError('Event\'s retry must be a integer and >= 0')
  }
}

export function assertEventStreamMessageComment(comment: string): void {
  if (containsEventStreamLineBreak(comment)) {
    throw new EventStreamEncoderError('Event\'s comment must not contain a carriage return or newline character')
  }
}

export function encodeEventStreamMessageData(data: string | undefined): string {
  if (data === undefined) {
    return ''
  }

  return `data: ${data.replace(EVENT_STREAM_LINE_ENDING_GLOBAL_REGEX, '\ndata: ')}\n`
}

export function encodeEventStreamMessageComments(comments: readonly string[] | undefined): string {
  let output = ''

  for (const comment of comments ?? []) {
    assertEventStreamMessageComment(comment)

    output += `: ${comment}\n`
  }

  return output
}

export function encodeEventStreamMessage(message: EventStreamMessage): string {
  let output = ''

  output += encodeEventStreamMessageComments(message.comments)

  if (message.event !== undefined) {
    assertEventStreamMessageName(message.event)

    output += `event: ${message.event}\n`
  }

  if (message.retry !== undefined) {
    assertEventStreamMessageRetry(message.retry)

    output += `retry: ${message.retry}\n`
  }

  if (message.id !== undefined) {
    assertEventStreamMessageId(message.id)

    output += `id: ${message.id}\n`
  }

  output += encodeEventStreamMessageData(message.data)
  output += '\n'

  return output
}
