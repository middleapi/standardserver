export interface EventStreamMessageMeta {
  /**
   * Event identifier, sent back by the client as `lastEventId` for reconnection attempts.
   *
   * @warning id cannot contain newline characters (`\n`)
   */
  id?: string | undefined

  /**
   * The number of milliseconds the client should wait before attempting to reconnect.
   */
  retry?: number | undefined

  /**
   * Comments associated with the event.
   *
   * @warning Comments must not contain newline characters (`\n`).
   */
  comments?: readonly string[] | undefined
}

export interface EventStreamMessage extends EventStreamMessageMeta {
  /**
   * Event name (e.g., `message`, `error`).
   */
  event?: string | undefined

  /**
   * Event data, typically JSON-encoded.
   */
  data?: string | undefined
}
