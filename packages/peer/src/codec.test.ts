import { describe, expect, it } from 'vitest'
import { decodePeerMessage, encodePeerMessage } from './codec'

describe('codec', () => {
  it('handles simple message (JSON only)', async () => {
    const message = { id: '1', type: 'request', payload: { foo: 'bar' } }

    const encoded = await encodePeerMessage(message as any)
    expect(typeof encoded).toBe('string')

    const decoded = decodePeerMessage(encoded)
    expect(decoded).toEqual({ matched: true, message })
  })

  it('handles message with prefix', async () => {
    const prefix = 'PRE:'
    const message = { id: '1', type: 'request', payload: 'test' }

    const encoded = await encodePeerMessage(message as any, { prefix }) as string
    expect(encoded).toBeTypeOf('string')
    expect(encoded.startsWith(prefix)).toBe(true)

    const decoded = decodePeerMessage(encoded, { prefix })
    expect(decoded).toEqual({ matched: true, message })
  })

  it('handles message with binary data (Uint8Array)', async () => {
    const binary = new Uint8Array([1, 2, 3, 4])
    const message = { id: '1', binary }

    const encoded = await encodePeerMessage(message as any) as Uint8Array<ArrayBuffer>
    expect(encoded).toBeInstanceOf(Uint8Array)

    const decoded = decodePeerMessage(encoded)
    expect(decoded).toEqual({ matched: true, message })
  })

  it('handles message with binary data (Blob)', async () => {
    const binaryData = new Uint8Array([10, 20])
    const blob = new Blob([binaryData])
    const message = { id: '2', binary: blob }

    const encoded = await encodePeerMessage(message as any) as Uint8Array<ArrayBuffer>
    expect(encoded).toBeInstanceOf(Uint8Array)

    const decoded = decodePeerMessage(encoded)
    expect(decoded).toEqual({ matched: true, message: { ...message, binary: binaryData } })
  })

  it('handles message with binary data and prefix', async () => {
    const prefix = 'ABC:'
    const binary = new Uint8Array([5, 6])
    const message = { id: '3', binary }

    const encoded = await encodePeerMessage(message as any, { prefix }) as Uint8Array<ArrayBuffer>
    expect(encoded).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(encoded).startsWith(prefix)).toBe(true)

    const decoded = decodePeerMessage(encoded, { prefix })
    expect(decoded).toEqual({ matched: true, message })
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

  it('decodes a binary message without binary payload (JSON only in Uint8Array)', () => {
    const message = { id: '3' }
    const textEncoder = new TextEncoder()
    const encoded = textEncoder.encode(JSON.stringify(message))

    const result = decodePeerMessage(encoded)
    expect(result).toEqual({ matched: true, message })
  })
})
