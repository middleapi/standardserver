import { serve } from '@hono/node-server'
import { withEventIteratorEventMeta } from '@standardserver/core/event-stream'
import { isAsyncIteratorObject } from '@standardserver/shared'
import { toStandardLazyRequest } from '../src/request'
import { toFetchResponse } from '../src/response'

serve({
  async fetch(request) {
    const body = await toStandardLazyRequest(request).body()

    if (isAsyncIteratorObject(body)) {
      while (true) {
        const value = await body.next()

        console.log(value)

        if (value.done) {
          break
        }
      }
    }

    async function* gen() {
      let i = 0
      try {
        while (i++ < 5) {
          yield withEventIteratorEventMeta({ now: Date.now() }, { retry: 0 })
          console.log('yield')
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        return withEventIteratorEventMeta({ event: 'done' }, { retry: 0 })
      }
      catch {
        console.log('---------------------error')
      }
      finally {
        console.log('---------------------done')
      }
    }

    return toFetchResponse({
      headers: {},
      status: 200,
      body: gen(),
    })
  },
  port: 3000,
})

console.log('Serve at http://localhost:3000')
