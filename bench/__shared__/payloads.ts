import assert from 'node:assert/strict'
import { stringifyJSON } from '@standardserver/shared'

const KB = 1024
const SIZES = { '1KB': KB, '100KB': 100 * KB, '10MB': 100 * 100 * KB } as const
type SizeLabel = keyof typeof SIZES
export const BODY_SIZE_ENTRIES = Object.entries(SIZES) as [SizeLabel, number][]

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const TEXT = `${ALNUM} .,;:!?@#&()[]{}/+_-`
const UNI = ['café', '東京', '🚀', 'São Paulo', '日本語', 'привет', '€99'] as const

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)]!
}

function alnum(r: () => number, n: number): string {
  if (n <= 0)
    return ''
  if (n > KB) {
    const u = alnum(r, KB)
    return u.repeat(Math.floor(n / KB)) + u.slice(0, n % KB)
  }
  let s = ''
  for (let i = 0; i < n; i++) s += ALNUM[Math.floor(r() * ALNUM.length)]!
  return s
}

function text(r: () => number, n: number): string {
  if (n <= 0)
    return ''
  if (n > KB) {
    const u = text(r, KB)
    return u.repeat(Math.floor(n / KB)) + u.slice(0, n % KB)
  }
  let s = ''
  while (s.length < n) s += r() < 0.1 ? pick(r, UNI) : TEXT[Math.floor(r() * TEXT.length)]!
  return s.slice(0, n)
}

function bytes(n: number, seed: number): Uint8Array<ArrayBuffer> {
  const r = rng(seed)
  const b = new Uint8Array(n) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < n; i++) {
    b[i] = r() < 0.15 && i > 0 ? b[i - 1]! : r() < 0.3 ? 0x20 + Math.floor(r() * 95) : Math.floor(r() * 256)
  }
  return b
}

function repeatBytes(unit: Uint8Array, times: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(unit.byteLength * times) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < times; i++) out.set(unit, i * unit.byteLength)
  return out
}

function jlen(v: unknown): number {
  return stringifyJSON(v)!.length
}

function padJson(value: object, size: number, seed: number): object {
  const r = rng(seed)
  const base = jlen({ ...value, _pad: '' })
  assert.ok(base <= size, `json core ${base} > ${size}`)
  return { ...value, _pad: alnum(r, size - base) }
}

function record(seed: number) {
  const r = rng(seed)
  return {
    id: `rec_${alnum(r, 10)}`,
    type: pick(r, ['user', 'order', 'event'] as const),
    active: r() > 0.4,
    score: Math.fround(r() * 100),
    tags: [pick(r, UNI), alnum(r, 6)],
    meta: { locale: pick(r, ['en-US', 'fr-FR', 'ja-JP']), region: pick(r, ['us-east-1', 'eu-west-1']), v: 1 + Math.floor(r() * 5) },
    profile: {
      name: text(r, 12),
      email: `${alnum(r, 8)}@example.com`,
      bio: text(r, 32),
    },
    payload: { kind: pick(r, ['snapshot', 'delta']), values: [r(), r(), r()], note: text(r, 20) },
  }
}

function split(buf: Uint8Array<ArrayBuffer>, parts: number): Uint8Array<ArrayBuffer>[] {
  const base = Math.floor(buf.byteLength / parts)
  let rem = buf.byteLength - base * parts
  const out: Uint8Array<ArrayBuffer>[] = []
  let off = 0
  for (let i = 0; i < parts; i++) {
    const n = base + (rem-- > 0 ? 1 : 0)
    out.push(buf.subarray(off, off + n) as Uint8Array<ArrayBuffer>)
    off += n
  }
  return out
}

function formSize(form: FormData): number {
  let n = 0
  for (const v of form.values()) n += typeof v === 'string' ? new TextEncoder().encode(v).byteLength : v.size
  return n
}

function makeForm(size: number, pool: Uint8Array<ArrayBuffer>, seed: number): FormData {
  const r = rng(seed)
  const form = new FormData()
  form.append('userId', `user_${alnum(r, 8)}`)
  form.append('action', pick(r, ['create', 'update', 'import']))
  form.append('meta', stringifyJSON({ tags: [pick(r, UNI), pick(r, UNI)], dryRun: r() > 0.5 })!)
  form.append('note', text(r, 40))
  form.append('thumb', new File([bytes(32, seed ^ 1)], 't.png', { type: 'image/png' }))
  const fileSize = size - formSize(form)
  assert.ok(fileSize > 0 && fileSize <= pool.byteLength)
  form.append('file', new File([pool.subarray(0, fileSize)], 'data.bin', { type: 'application/octet-stream' }))
  return form
}

function makeParams(size: number, seed: number): URLSearchParams {
  const r = rng(seed)
  const p = new URLSearchParams({
    'page': String(1 + Math.floor(r() * 20)),
    'sort': pick(r, ['created_at', 'score']),
    'q': alnum(r, 12),
    'filter[status]': pick(r, ['active', 'pending']),
    'cursor': alnum(r, 16),
    'data': '',
  })
  const base = p.toString().length
  assert.ok(base <= size)
  p.set('data', alnum(r, size - base))
  const d = size - p.toString().length
  if (d)
    p.set('data', (p.get('data') ?? '') + alnum(r, d))
  return p
}

interface Event { type: string, [k: string]: unknown }

function eventSize(parts: readonly Event[]): number {
  return parts.reduce((n, p) => n + jlen(p), 0)
}

function makeEvents(size: number, seed: number): Event[] {
  const r = rng(seed)
  const parts: Event[] = [
    { type: 'heartbeat', ts: 1_700_000_000_000 + Math.floor(r() * 1e6), seq: Math.floor(r() * 1e6) },
    { type: 'progress', jobId: alnum(r, 8), percent: Math.floor(r() * 100), stage: pick(r, ['running', 'done']) },
    { type: 'message', id: alnum(r, 8), text: text(r, 20), tags: [pick(r, UNI)] },
    { type: 'message', id: 'pad', channel: 'pad', text: '', tags: ['pad'] },
  ]
  const base = eventSize(parts)
  assert.ok(base <= size, `event core ${base} > ${size}`)
  parts[parts.length - 1]!.text = alnum(r, size - base)
  return parts
}

function fitJson(unit: object, size: number, seed: number): object {
  for (let n = 100; n > 0; n--) {
    const core = { n, items: Array.from({ length: n }, (_, i) => ({ i, data: unit })) }
    if (jlen({ ...core, _pad: '' }) <= size)
      return padJson(core, size, seed)
  }
  throw new Error(`cannot fit json under ${size}`)
}

function fitEvents(unit: object, size: number, seed: number): Event[] {
  const r = rng(seed)
  const parts: Event[] = []
  for (let i = 0; i < 100; i++) {
    const next = [...parts, { type: 'batch', i, data: unit }, { type: 'message', id: 'pad', text: '', tags: ['pad'] }]
    if (eventSize(next) > size)
      break
    parts.push({ type: 'batch', i, data: unit })
  }
  assert.ok(parts.length > 0)
  parts.push({ type: 'message', id: 'pad', text: '', tags: ['pad'] })
  parts[parts.length - 1]!.text = alnum(r, size - eventSize(parts))
  return parts
}

const BYTES1KB = bytes(SIZES['1KB'], 0xB001)
assert.equal(BYTES1KB.byteLength, SIZES['1KB'])
const BYTES100KB = repeatBytes(BYTES1KB, 100)
assert.equal(BYTES100KB.byteLength, SIZES['100KB'])
const BYTES10MB = repeatBytes(BYTES100KB, 100)
assert.equal(BYTES10MB.byteLength, SIZES['10MB'])

const JSON1KB = padJson(record(0xA001), SIZES['1KB'], 0xA101)
assert.equal(jlen(JSON1KB), SIZES['1KB'])
const JSON100KB = padJson(
  { items: Array.from({ length: 100 }, (_, i) => ({ i, item: record(0xA200 + i) })) },
  SIZES['100KB'],
  0xA201,
)
assert.equal(jlen(JSON100KB), SIZES['100KB'])
const JSON10MB = fitJson(JSON100KB, SIZES['10MB'], 0xA301)
assert.equal(jlen(JSON10MB), SIZES['10MB'])

const BLOB1KB = new Blob([BYTES1KB], { type: 'application/octet-stream' })
assert.equal(BLOB1KB.size, SIZES['1KB'])
const BLOB100KB = new Blob([BYTES100KB], { type: 'application/octet-stream' })
assert.equal(BLOB100KB.size, SIZES['100KB'])
const BLOB10MB = new Blob([BYTES10MB], { type: 'application/octet-stream' })
assert.equal(BLOB10MB.size, SIZES['10MB'])

const FORM1KB = makeForm(SIZES['1KB'], BYTES1KB, 0xF001)
assert.equal(formSize(FORM1KB), SIZES['1KB'])
const FORM100KB = makeForm(SIZES['100KB'], BYTES100KB, 0xF101)
assert.equal(formSize(FORM100KB), SIZES['100KB'])
const FORM10MB = makeForm(SIZES['10MB'], BYTES10MB, 0xF201)
assert.equal(formSize(FORM10MB), SIZES['10MB'])

const USP1KB = makeParams(SIZES['1KB'], 0xC001)
assert.equal(USP1KB.toString().length, SIZES['1KB'])
const USP100KB = makeParams(SIZES['100KB'], 0xC101)
assert.equal(USP100KB.toString().length, SIZES['100KB'])
const USP10MB = makeParams(SIZES['10MB'], 0xC201)
assert.equal(USP10MB.toString().length, SIZES['10MB'])

const EVENTS1KB = makeEvents(SIZES['1KB'], 0xE001)
assert.equal(eventSize(EVENTS1KB), SIZES['1KB'])
const EVENTS100KB = Array.from({ length: 100 }, (_, i) => i === 0 ? EVENTS1KB : makeEvents(SIZES['1KB'], 0xE100 + i)).flat()
assert.equal(eventSize(EVENTS100KB), SIZES['100KB'])
const EVENTS10MB = fitEvents(JSON100KB, SIZES['10MB'], 0xE201)
assert.equal(eventSize(EVENTS10MB), SIZES['10MB'])

const OCTET1KB = split(BYTES1KB, 8)
assert.equal(OCTET1KB.reduce((n, c) => n + c.byteLength, 0), SIZES['1KB'])
const OCTET100KB = split(BYTES100KB, 32)
assert.equal(OCTET100KB.reduce((n, c) => n + c.byteLength, 0), SIZES['100KB'])
const OCTET10MB = split(BYTES10MB, 64)
assert.equal(OCTET10MB.reduce((n, c) => n + c.byteLength, 0), SIZES['10MB'])

export function asEventStream(parts: readonly Event[]): AsyncGenerator<Event, void, undefined> {
  return (async function* () {
    for (const p of parts) yield p
  }())
}

export function asOctetStream(parts: readonly Uint8Array<ArrayBuffer>[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  let i = 0
  return new ReadableStream({
    pull(c) {
      if (i >= parts.length)
        c.close()
      else c.enqueue(parts[i++]!)
    },
  })
}

export const BODY_PAYLOADS = {
  '1KB': {
    json: JSON1KB,
    blob: BLOB1KB,
    formData: FORM1KB,
    urlSearchParams: USP1KB,
    eventParts: EVENTS1KB,
    octetParts: OCTET1KB,
  },
  '100KB': {
    json: JSON100KB,
    blob: BLOB100KB,
    formData: FORM100KB,
    urlSearchParams: USP100KB,
    eventParts: EVENTS100KB,
    octetParts: OCTET100KB,
  },
  '10MB': {
    json: JSON10MB,
    blob: BLOB10MB,
    formData: FORM10MB,
    urlSearchParams: USP10MB,
    eventParts: EVENTS10MB,
    octetParts: OCTET10MB,
  },
} as const
