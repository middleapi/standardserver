import type { EventStreamMessage } from './types'
import { EventStreamEncoderError } from './error'

export function assertEventStreamMessageId(id: string): void {
  if (id.includes('\n')) {
    throw new EventStreamEncoderError('Event\'s id must not contain a newline character')
  }
}

export function assertEventStreamMessageName(event: string): void {
  if (event.includes('\n')) {
    throw new EventStreamEncoderError('Event\'s event must not contain a newline character')
  }
}

export function assertEventStreamMessageRetry(retry: number): void {
  if (!Number.isInteger(retry) || retry < 0) {
    throw new EventStreamEncoderError('Event\'s retry must be a integer and >= 0')
  }
}

export function assertEventStreamMessageComment(comment: string): void {
  if (comment.includes('\n')) {
    throw new EventStreamEncoderError('Event\'s comment must not contain a newline character')
  }
}

export function encodeEventStreamMessageData(data: string | undefined): string {
  const lines = data?.split(/\n/) ?? []

  let output = ''

  for (const line of lines) {
    output += `data: ${line}\n`
  }

  return output
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
