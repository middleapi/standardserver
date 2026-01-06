import type { StandardRequest, StandardResponse } from '@standardserver/core'
import type { EventStreamMessage as EventIteratorEventMessage } from '@standardserver/core/event-stream'

/**
 * Base interface for all peer messages.
 *
 * SHOULD only contain data that friendly with structure clone algorithm.
 */
export interface PeerMessage {
  /**
   * Correlation ID for a single request/response lifecycle.
   *
   * The same ID is shared by the initial request, its response,
   * and any related stream or event messages.
   */
  id: string
  /**
   * Discriminator that defines the message semantics and payload shape.
   */
  kind: string
  /**
   * Structured payload.
   *
   * Its shape is determined by `kind`.
   */
  json?: unknown
  /**
   * Binary payload.
   *
   * Only present for message kinds that support binary transfer.
   */
  binary?: Uint8Array<ArrayBuffer> | Blob | undefined
}

/**
 * Starts a new request from client to server.
 *
 * This is always the first message in a request/response cycle.
 */
export interface PeerRequestMessage extends PeerMessage {
  /**
   * The kind of the message.
   */
  kind: 'request'
  /**
   * The actual content of the message. The structure depends on the `kind`.
   */
  json: Omit<StandardRequest, 'signal' | 'url'> & {
    /**
     * Serialized URL.
     */
    url: string
  }
}

/**
 * Sends the final response from server to client.
 *
 * Typically sent once per `PeerRequestMessage`, unless followed by streaming messages.
 */
export interface PeerResponseMessage extends PeerMessage {
  /**
   * The kind of the message.
   */
  kind: 'response'
  /**
   * The actual content of the message. The structure depends on the `kind`.
   */
  json: StandardResponse
}

/**
 * Indicates that a request/response/stream should be terminated.
 *
 * - **Client → Server**: Cancel an in-flight request or stop consuming a stream.
 * - **Server → Client**: Signal an error or premature termination.
 */
export interface PeerAbortMessage extends PeerMessage {
  /**
   * The kind of the message.
   */
  kind: 'abort'
  /**
   * This message does not have a JSON payload.
   */
  json?: undefined
  /**
   * Abort messages carry no binary payload.
   */
  binary?: undefined
}

/**
 * Transfers a single event from an event stream/iterator.
 *
 * Can flow in either direction (Client ↔ Server),
 * depending on which side owns the event iterator.
 *
 * **Constraint**:
 * Must be sent after:
 * - `PeerRequestMessage` (client-to-server streaming), or
 * - `PeerResponseMessage` (server-to-client streaming).
 */
export interface PeerEventStreamMessage extends PeerMessage {
  /**
   * The kind of the message.
   */
  kind: 'event-stream'
  /**
   * The actual content of the message. The structure depends on the `kind`.
   */
  json: Omit<EventIteratorEventMessage, 'data'> & {
    /**
     * The event data.
     */
    data?: unknown
  }
  /**
   * Event-stream messages never carry binary payloads.
   */
  binary?: undefined
}

/**
 * Transfers a binary chunk for an octet-stream.
 *
 * Can flow in either direction (Client ↔ Server).
 *
 * **Constraint**:
 * Must be sent after:
 * - `PeerRequestMessage` (client-to-server streaming), or
 * - `PeerResponseMessage` (server-to-client streaming).
 */
export interface PeerOctetStreamMessage extends PeerMessage {
  /**
   * The kind of the message.
   */
  kind: 'octet-stream'
  /**
   * The actual content of the message. The structure depends on the `kind`.
   */
  json: {
    /**
     * Marks the final chunk of the stream.
     *
     * @default false
     */
    end?: boolean | undefined
  }

  /**
   * Binary payload.
   *
   * SHOULD always be present even if `json.end` is `true`.
   */
  binary?: Uint8Array<ArrayBuffer> | Blob | undefined
}
