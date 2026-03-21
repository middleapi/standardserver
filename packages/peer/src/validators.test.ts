import type { PeerMessage } from './types'
import { isClientPeerSendMessage, isPeerCancelMessage, isPeerEventStreamMessage, isPeerMessage, isPeerOctetStreamMessage, isPeerRequestMessage, isPeerResponseMessage, isPeerStreamCancelMessage, isServerPeerSendMessage } from './validators'

function base(overrides?: Partial<PeerMessage>): PeerMessage {
  return { id: 'abc', kind: 'request', ...overrides }
}

const validRequest = { method: 'GET', url: '/path', headers: {} }
const validResponse = { status: 200, headers: {} }

describe('isPeerMessage', () => {
  it('accepts minimal valid message', () => expect(isPeerMessage(base())).toBe(true))
  it('accepts binary as Uint8Array', () => expect(isPeerMessage(base({ binary: new Uint8Array() }))).toBe(true))
  it('accepts binary as Blob', () => expect(isPeerMessage(base({ binary: new Blob() }))).toBe(true))

  it.each([
    ['invalid kind', base({ kind: 123 as any })],
    ['binary as string', base({ binary: 'data' as any })],
    ['null', null],
    ['array', []],
  ])('rejects %s', (_, v) => expect(isPeerMessage(v)).toBe(false))
})

describe('isPeerRequestMessage', () => {
  it('accepts valid request message', () => {
    expect(isPeerRequestMessage(base({ kind: 'request', json: validRequest }))).toBe(true)
  })

  it('rejects wrong kind', () => {
    expect(isPeerRequestMessage(base({ kind: 'response', json: validRequest }))).toBe(false)
  })

  it('rejects invalid json', () =>
    expect(isPeerRequestMessage(base({ kind: 'request', json: {} }))).toBe(false))
})

describe('isPeerResponseMessage', () => {
  it('accepts valid response message', () => {
    expect(isPeerResponseMessage(base({ kind: 'response', json: validResponse }))).toBe(true)
  })

  it('rejects wrong kind', () => {
    expect(isPeerResponseMessage(base({ kind: 'request', json: validResponse }))).toBe(false)
  })

  it('rejects invalid status', () => {
    expect(isPeerResponseMessage(base({ kind: 'response', json: { status: 'invalid', headers: {} } }))).toBe(false)
  })
})

describe('isPeerCancelMessage', () => {
  it('accepts valid cancel', () => {
    expect(isPeerCancelMessage(base({ kind: 'cancel', json: undefined, binary: undefined }))).toBe(true)
  })

  it('rejects when json is set', () => {
    expect(isPeerCancelMessage(base({ kind: 'cancel', json: {} }))).toBe(false)
  })

  it('rejects when binary is set', () => {
    expect(isPeerCancelMessage(base({ kind: 'cancel', binary: new Uint8Array() }))).toBe(false)
  })

  it('rejects when wrong kind', () => {
    expect(isPeerCancelMessage(base({ kind: 'invalid', binary: new Uint8Array() }))).toBe(false)
  })
})

describe('isPeerEventStreamMessage', () => {
  const msg = (json: unknown, binary?: any) =>
    base({ kind: 'event-stream', json, binary })

  it('accepts minimal event', () => {
    expect(isPeerEventStreamMessage(msg({}))).toBe(true)
  })

  it('accepts full valid payload', () => {
    expect(isPeerEventStreamMessage(msg({ id: 'e1', event: 'update', data: { x: 1 }, retry: 3000, comments: ['ok'] }))).toBe(true)
  })

  it('rejects binary present', () => {
    expect(isPeerEventStreamMessage(msg({}, new Uint8Array()))).toBe(false)
  })

  it('rejects non-object json', () => {
    expect(isPeerEventStreamMessage(msg('string'))).toBe(false)
  })

  it.each([
    ['non-string id', { id: 42 }],
    ['non-string event', { event: true }],
    ['non-finite retry', { retry: Infinity }],
    ['non-string-array comments', { comments: [1, 2] }],
  ])('rejects %s', (_, json) => expect(isPeerEventStreamMessage(msg(json))).toBe(false))
})

describe('isPeerOctetStreamMessage', () => {
  it('accepts close: false', () => {
    expect(isPeerOctetStreamMessage(base({ kind: 'octet-stream', json: { close: false } }))).toBe(true)
  })

  it('accepts close: true with binary', () => {
    expect(isPeerOctetStreamMessage(base({ kind: 'octet-stream', json: { close: true }, binary: new Uint8Array() }))).toBe(true)
  })

  it('rejects wrong field name (end instead of close)', () => {
    expect(isPeerOctetStreamMessage(base({ kind: 'octet-stream', json: { end: false } as any }))).toBe(false)
  })

  it('rejects non-boolean close', () => {
    expect(isPeerOctetStreamMessage(base({ kind: 'octet-stream', json: { close: 1 } as any }))).toBe(false)
  })

  it('rejects wrong kind', () => {
    expect(isPeerOctetStreamMessage(base({ kind: 'event-stream', json: { close: false } }))).toBe(false)
  })
})

describe('isPeerStreamCancelMessage', () => {
  it('accepts valid stream/cancel', () => {
    expect(isPeerStreamCancelMessage(base({ kind: 'stream/cancel', json: undefined, binary: undefined }))).toBe(true)
  })

  it('rejects when json is set', () => {
    expect(isPeerStreamCancelMessage(base({ kind: 'stream/cancel', json: {} }))).toBe(false)
  })

  it('rejects when binary is set', () => {
    expect(isPeerStreamCancelMessage(base({ kind: 'stream/cancel', binary: new Blob([]) }))).toBe(false)
  })

  it('rejects wrong kind', () => {
    expect(isPeerStreamCancelMessage(base({ kind: 'cancel' }))).toBe(false)
  })
})

describe('isClientPeerSendMessage', () => {
  it.each([
    ['request', { kind: 'request', json: validRequest }],
    ['cancel', { kind: 'cancel', json: undefined, binary: undefined }],
    ['event-stream', { kind: 'event-stream', json: {} }],
    ['octet-stream', { kind: 'octet-stream', json: { close: false } }],
  ])('accepts %s', (_, overrides) => {
    expect(isClientPeerSendMessage(base(overrides))).toBe(true)
  })

  it.each([
    ['response', { kind: 'response', json: validResponse }],
    ['stream/cancel', { kind: 'stream/cancel', json: undefined, binary: undefined }],
  ])('rejects %s', (_, overrides) => {
    expect(isClientPeerSendMessage(base(overrides))).toBe(false)
  })
})

describe('isServerPeerSendMessage', () => {
  it.each([
    ['response', { kind: 'response', json: validResponse }],
    ['cancel', { kind: 'cancel', json: undefined, binary: undefined }],
    ['event-stream', { kind: 'event-stream', json: {} }],
    ['octet-stream', { kind: 'octet-stream', json: { close: false } }],
    ['stream/cancel', { kind: 'stream/cancel', json: undefined, binary: undefined }],
  ])('accepts %s', (_, overrides) => {
    expect(isServerPeerSendMessage(base(overrides))).toBe(true)
  })

  it('rejects request', () => {
    expect(isServerPeerSendMessage(base({ kind: 'request', json: validRequest }))).toBe(false)
  })
})
