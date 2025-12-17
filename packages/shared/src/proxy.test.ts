import { describe, expect, it } from 'vitest'
import { createEnhancedProxy } from './proxy'

describe('createEnhancedProxy', () => {
  it('should allow handler to intercept and modify values', () => {
    const target = { foo: 'bar', foo2: 'bar2' }
    const handler = {
      get: (_target: typeof target, p: PropertyKey, _receiver: any, fallback: () => any) => {
        if (p === 'foo') {
          return 'baz'
        }
        return fallback()
      },
    }
    const proxy = createEnhancedProxy(target, handler)
    expect(proxy.foo).toBe('baz')
    expect(proxy.foo2).toBe('bar2')
  })

  it('should auto-bind and cache methods when accessed via fallback', () => {
    const target = {
      name: 'target',
      getName() {
        return this.name
      },
    }
    const handler = {
      get: (_target: typeof target, _p: PropertyKey, _receiver: any, fallback: () => any) => {
        return fallback()
      },
    }
    const proxy = createEnhancedProxy(target, handler)
    const getName = proxy.getName
    expect(getName()).toBe('target') // should bind
    expect(getName).toBe(proxy.getName) // should cache
  })
})
