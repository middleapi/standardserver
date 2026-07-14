import type { StandardHeaders } from '@standardserver/core'
import {
  flattenStandardHeader,
  generateContentDisposition,
  getFilenameFromContentDisposition,
  isStandardHeaders,
  isStandardRequest,
  isStandardResponse,
  mergeStandardHeaders,
  parseStandardUrl,
} from '@standardserver/core'
import { bench, describe } from 'vitest'

const sampleHeaders: StandardHeaders = {
  'content-type': 'application/json',
  'accept': ['application/json', 'text/plain'],
  'user-agent': 'standard-server-bench',
  'x-request-id': 'abc-123-def-456',
  'set-cookie': ['a=1; HttpOnly', 'b=2; Secure'],
}

const otherHeaders: StandardHeaders = {
  'content-type': 'text/html',
  'x-custom': 'value',
  'accept': 'application/xml',
}

const sampleRequest = {
  method: 'POST',
  url: '/api/v1/resource?page=1&limit=20#section',
  headers: sampleHeaders,
}

const sampleResponse = {
  status: 200,
  headers: sampleHeaders,
}

const contentDisposition = generateContentDisposition('rapport final (été 2024).pdf')

describe('core / url parsing', () => {
  bench('parseStandardUrl - full url', () => {
    parseStandardUrl('/api/v1/resource?page=1&limit=20#section')
  })

  bench('parseStandardUrl - pathname only', () => {
    parseStandardUrl('/api/v1/resource')
  })
})

describe('core / headers', () => {
  bench('flattenStandardHeader - array', () => {
    flattenStandardHeader(['application/json', 'text/plain', 'text/html'])
  })

  bench('mergeStandardHeaders', () => {
    mergeStandardHeaders(sampleHeaders, otherHeaders)
  })

  bench('isStandardHeaders', () => {
    isStandardHeaders(sampleHeaders)
  })
})

describe('core / content-disposition', () => {
  bench('generateContentDisposition', () => {
    generateContentDisposition('rapport final (été 2024).pdf')
  })

  bench('getFilenameFromContentDisposition', () => {
    getFilenameFromContentDisposition(contentDisposition)
  })
})

describe('core / validators', () => {
  bench('isStandardRequest', () => {
    isStandardRequest(sampleRequest)
  })

  bench('isStandardResponse', () => {
    isStandardResponse(sampleResponse)
  })
})
