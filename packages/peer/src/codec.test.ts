import type { PeerMessage } from './types'
import { decodePeerMessage, encodePeerMessage } from './codec'

describe('codec', () => {
  it('handles simple message (JSON only)', async () => {
    const message = { id: '1', kind: 'request', payload: { foo: 'bar' } }

    const encoded = await encodePeerMessage(message)
    expect(typeof encoded).toBe('string')

    const decoded = decodePeerMessage(encoded)
    expect(decoded).toEqual({ matched: true, message })
  })

  it('handles message with prefix', async () => {
    const prefix = 'PRE:'
    const message = { id: '1', kind: 'request', payload: 'test' }

    const encoded = await encodePeerMessage(message, { prefix }) as string
    expect(encoded).toBeTypeOf('string')
    expect(encoded.startsWith(prefix)).toBe(true)

    const decoded = decodePeerMessage(encoded, { prefix })
    expect(decoded).toEqual({ matched: true, message })
  })

  it('handles message with binary data (Uint8Array)', async () => {
    const binary = new Uint8Array([1, 2, 3, 4])
    const message = { id: '1', kind: 'x', binary }

    const encoded = await encodePeerMessage(message) as Uint8Array<ArrayBuffer>
    expect(encoded).toBeInstanceOf(Uint8Array)

    const decoded = decodePeerMessage(encoded)
    expect(decoded).toEqual({ matched: true, message })
  })

  it('handles message with binary data (Blob)', async () => {
    const binaryData = new Uint8Array([10, 20])
    const blob = new Blob([binaryData])
    const message = { id: '2', kind: 'x', binary: blob }

    const encoded = await encodePeerMessage(message) as Uint8Array<ArrayBuffer>
    expect(encoded).toBeInstanceOf(Uint8Array)

    const decoded = decodePeerMessage(encoded)
    expect(decoded).toEqual({ matched: true, message: { ...message, binary: binaryData } })
  })

  it('handles message with binary data and prefix', async () => {
    const prefix = 'ABC:'
    const binary = new Uint8Array([5, 6])
    const message = { id: '3', kind: 'x', binary }

    const encoded = await encodePeerMessage(message, { prefix }) as Uint8Array<ArrayBuffer>
    expect(encoded).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(encoded).startsWith(prefix)).toBe(true)

    const decoded = decodePeerMessage(encoded, { prefix })
    expect(decoded).toEqual({ matched: true, message })
  })

  it('handles empty binary payload', async () => {
    const binary = new Uint8Array(0)
    const message = { id: '4', kind: 'x', binary }

    const encoded = await encodePeerMessage(message)
    expect(encoded).toBeInstanceOf(Uint8Array)

    const decoded = decodePeerMessage(encoded)
    expect(decoded).toEqual({ matched: true, message })
  })

  it('handles unicode characters in JSON', async () => {
    const message = { id: '5', kind: 'y', data: '你好世界 🌍 áéíóú' }

    const encoded = await encodePeerMessage(message)
    const decoded = decodePeerMessage(encoded)
    expect(decoded).toEqual({ matched: true, message })
  })

  describe('decode', () => {
    it('can decodes a binary message without binary payload (JSON only in Uint8Array)', () => {
      const message: PeerMessage = { id: '3', kind: 'g' }
      const textEncoder = new TextEncoder()
      const encoded = textEncoder.encode(JSON.stringify(message))

      const result = decodePeerMessage(encoded)
      expect(result).toEqual({ matched: true, message })
    })

    it('returns matched: false for string mismatch prefix', () => {
      const encoded = 'WRONG:{"id":1}'
      const result = decodePeerMessage(encoded, { prefix: 'RIGHT:' })
      expect(result).toEqual({ matched: false })
    })

    it('returns matched: false for binary mismatch prefix', () => {
      const textEncoder = new TextEncoder()
      const encoded = textEncoder.encode('WRONG:{}')
      const result = decodePeerMessage(encoded, { prefix: 'RIGHT:' })
      expect(result).toEqual({ matched: false })
    })

    it('returns matched: false for malformed JSON string input', () => {
      expect(decodePeerMessage('not valid json')).toEqual({ matched: false })
    })

    it('returns matched: false for malformed JSON binary input', () => {
      const encoded = new TextEncoder().encode('not valid json')
      expect(decodePeerMessage(encoded)).toEqual({ matched: false })
    })

    it('returns matched: false for invalid peer message', async () => {
      const encoded = await encodePeerMessage({ id: '1' } as any) as string // missing `kind`
      expect(decodePeerMessage(encoded)).toEqual({ matched: false })
      expect(decodePeerMessage(new TextEncoder().encode(encoded))).toEqual({ matched: false })
    })

    it('returns matched: false for invalid peer message with binary', async () => {
      const encoded = await encodePeerMessage({ id: '1', binary: new Blob(['a']) } as any) // missing `kind`
      expect(decodePeerMessage(encoded)).toEqual({ matched: false })
    })
  })
})
