import type { PeerMessage } from './types'
import { stringifyJSON } from '@standardserver/shared'

/**
 * A single byte used to separate the JSON payload from trailing binary data.
 *
 * 0xFF is guaranteed not to appear in UTF-8 encoded JSON, since TextEncoder
 * never emits this value. This makes the boundary unambiguous.
 */
const JSON_BINARY_SEPARATOR_BYTE = 0xFF

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * Encodes a PeerMessage into a wire-safe representation.
 *
 * - If no binary data is present, the message is encoded as a JSON string.
 * - If binary data exists, the output is:
 *   [ UTF-8 JSON bytes | separator byte | raw binary bytes ]
 */
export async function encodePeerMessage(
  message: PeerMessage,
): Promise<string | Uint8Array<ArrayBuffer>> {
  if (message.binary === undefined) {
    return stringifyJSON(message)
  }

  const jsonBytes = textEncoder.encode(stringifyJSON(message))

  const binaryBytes
    = message.binary instanceof Blob
      ? new Uint8Array(await message.binary.arrayBuffer())
      : message.binary

  const output = new Uint8Array(
    jsonBytes.length + 1 + binaryBytes.length,
  )

  output.set(jsonBytes, 0)
  output[jsonBytes.length] = JSON_BINARY_SEPARATOR_BYTE
  output.set(binaryBytes, jsonBytes.length + 1)

  return output
}

/**
 * Decodes a wire-encoded PeerMessage.
 *
 * - String input is treated as pure JSON.
 * - Binary input may contain only JSON bytes, or JSON followed by binary data
 *   separated by the separator byte.
 */
export function decodePeerMessage(
  data: string | Uint8Array<ArrayBuffer>,
): PeerMessage {
  if (typeof data === 'string') {
    return JSON.parse(data)
  }

  const separatorIndex = data.indexOf(JSON_BINARY_SEPARATOR_BYTE)

  // No separator means the payload is JSON-only.
  if (separatorIndex === -1) {
    return JSON.parse(textDecoder.decode(data))
  }

  const jsonBytes = data.subarray(0, separatorIndex)
  const binaryBytes = data.subarray(separatorIndex + 1)

  return {
    ...JSON.parse(textDecoder.decode(jsonBytes)),
    binary: binaryBytes,
  }
}
