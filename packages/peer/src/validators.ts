import type { ClientPeerSendMessage, PeerCancelMessage, PeerEventStreamMessage, PeerMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage, PeerStreamCancelMessage, ServerPeerSendMessage } from './types'
import { isStandardRequest, isStandardResponse } from '@standardserver/core'
import { isTypescriptObject } from '@standardserver/shared'

export function isPeerMessage(maybe: unknown): maybe is PeerMessage {
  if (!isTypescriptObject(maybe)) {
    return false
  }

  if (typeof maybe.id !== 'string') {
    return false
  }

  if (typeof maybe.kind !== 'string') {
    return false
  }

  if (maybe.binary !== undefined && !(maybe.binary instanceof Uint8Array) && !(maybe.binary instanceof Blob)) {
    return false
  }

  return true
}

export function isPeerRequestMessage(maybe: PeerMessage): maybe is PeerRequestMessage {
  return maybe.kind === 'request' && isStandardRequest(maybe.json)
}

export function isPeerResponseMessage(maybe: PeerMessage): maybe is PeerResponseMessage {
  return maybe.kind === 'response' && isStandardResponse(maybe.json)
}

export function isPeerCancelMessage(maybe: PeerMessage): maybe is PeerCancelMessage {
  return maybe.kind === 'cancel' && maybe.json === undefined && maybe.binary === undefined
}

export function isPeerEventStreamMessage(maybe: PeerMessage): maybe is PeerEventStreamMessage {
  if (maybe.kind !== 'event-stream' || maybe.binary !== undefined) {
    return false
  }

  if (!isTypescriptObject(maybe.json)) {
    return false
  }

  if (maybe.json.id !== undefined && typeof maybe.json.id !== 'string') {
    return false
  }

  if (maybe.json.event !== undefined && typeof maybe.json.event !== 'string') {
    return false
  }

  if (maybe.json.retry !== undefined && !Number.isFinite(maybe.json.retry)) {
    return false
  }

  if (
    maybe.json.comments !== undefined
    && !(Array.isArray(maybe.json.comments) && maybe.json.comments.every(v => typeof v === 'string'))
  ) {
    return false
  }

  return true
}

export function isPeerOctetStreamMessage(maybe: PeerMessage): maybe is PeerOctetStreamMessage {
  return maybe.kind === 'octet-stream' && isTypescriptObject(maybe.json) && typeof maybe.json.close === 'boolean'
}

export function isPeerStreamCancelMessage(maybe: PeerMessage): maybe is PeerStreamCancelMessage {
  return maybe.kind === 'stream/cancel' && maybe.json === undefined && maybe.binary === undefined
}

export function isClientPeerSendMessage(maybe: PeerMessage): maybe is ClientPeerSendMessage {
  return isPeerRequestMessage(maybe)
    || isPeerCancelMessage(maybe)
    || isPeerEventStreamMessage(maybe)
    || isPeerOctetStreamMessage(maybe)
}

export function isServerPeerSendMessage(maybe: PeerMessage): maybe is ServerPeerSendMessage {
  return isPeerResponseMessage(maybe)
    || isPeerCancelMessage(maybe)
    || isPeerEventStreamMessage(maybe)
    || isPeerOctetStreamMessage(maybe)
    || isPeerStreamCancelMessage(maybe)
}
