import type { StandardHeaders } from '@standardserver/core'
import { toFetchHeaders, toStandardHeaders, toStandardUrl } from '@standardserver/fetch'
import { bench, describe } from 'vitest'

const fetchHeaders = new Headers()
fetchHeaders.append('content-type', 'application/json')
fetchHeaders.append('accept', 'application/json')
fetchHeaders.append('accept', 'text/plain')
fetchHeaders.append('set-cookie', 'a=1; HttpOnly')
fetchHeaders.append('set-cookie', 'b=2; Secure')
fetchHeaders.append('user-agent', 'standard-server-bench')
fetchHeaders.append('x-request-id', 'abc-123-def-456')

const standardHeaders: StandardHeaders = {
  'content-type': 'application/json',
  'accept': ['application/json', 'text/plain'],
  'set-cookie': ['a=1; HttpOnly', 'b=2; Secure'],
  'user-agent': 'standard-server-bench',
  'x-request-id': 'abc-123-def-456',
}

const url = new URL('https://example.com/api/v1/resource?page=1&limit=20#section')

describe('fetch / headers', () => {
  bench('toStandardHeaders', () => {
    toStandardHeaders(fetchHeaders)
  })

  bench('toFetchHeaders', () => {
    toFetchHeaders(standardHeaders)
  })
})

describe('fetch / url', () => {
  bench('toStandardUrl', () => {
    toStandardUrl(url)
  })
})
