import http from 'node:http'
import http2 from 'node:http2'
import { connect } from 'node:net'
import { canWriteToNodeResponse, getNodeResponseError } from './utils'

describe('canWriteToNodeResponse', () => {
  it('on http1 response aborted by client', async ({ onTestFinished }) => {
    const server = http.createServer()
    onTestFinished(() => new Promise<any>(r => server.close(r)))

    const handled = new Promise<void>((resolve, reject) => {
      server.on('request', async (req, res) => {
        try {
          expect(canWriteToNodeResponse(res)).toBe(true)

          await new Promise<void>(r => res.once('close', () => r()))

          expect(canWriteToNodeResponse(res)).toBe(false)

          resolve()
        }
        catch (error) {
          reject(error)
        }
      })
    })

    await new Promise<void>(r => server.listen(0, r))
    const port = (server.address() as any).port

    const socket = connect(port, '127.0.0.1', () => {
      socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n')

      setTimeout(() => {
        socket.destroy()
      }, 50)
    })

    await handled
  })

  it('on http1 response finished normally', async ({ onTestFinished }) => {
    const server = http.createServer()
    onTestFinished(() => new Promise<any>(r => server.close(r)))

    const handled = new Promise<void>((resolve, reject) => {
      server.on('request', async (req, res) => {
        try {
          expect(canWriteToNodeResponse(res)).toBe(true)

          res.end('ok')

          await vi.waitFor(() => {
            expect(canWriteToNodeResponse(res)).toBe(false)
          })

          resolve()
        }
        catch (error) {
          reject(error)
        }
      })
    })

    await new Promise<void>(r => server.listen(0, r))
    const port = (server.address() as any).port

    http.get(`http://localhost:${port}`, res => res.resume())

    await handled
  })

  it('on http1 response with headers already flushed', async ({ onTestFinished }) => {
    const server = http.createServer()
    onTestFinished(() => new Promise<any>(r => server.close(r)))

    const handled = new Promise<void>((resolve, reject) => {
      server.on('request', async (req, res) => {
        try {
          expect(canWriteToNodeResponse(res)).toBe(true)

          res.flushHeaders()

          expect(res.headersSent).toBe(true)
          expect(canWriteToNodeResponse(res)).toBe(false)

          res.end()

          resolve()
        }
        catch (error) {
          reject(error)
        }
      })
    })

    await new Promise<void>(r => server.listen(0, r))
    const port = (server.address() as any).port

    http.get(`http://localhost:${port}`, res => res.resume())

    await handled
  })

  it('on http2 response aborted by client', async ({ onTestFinished }) => {
    const server = http2.createServer()
    onTestFinished(() => new Promise<any>(r => server.close(r)))

    const handled = new Promise<void>((resolve, reject) => {
      server.on('request', async (req, res) => {
        try {
          expect(canWriteToNodeResponse(res)).toBe(true)

          await new Promise<void>(r => res.stream.once('close', () => r()))

          expect(canWriteToNodeResponse(res)).toBe(false)

          resolve()
        }
        catch (error) {
          reject(error)
        }
      })
    })

    await new Promise<void>(r => server.listen(0, r))
    const port = (server.address() as any).port

    const client = http2.connect(`http://localhost:${port}`)
    const reqStream = client.request({ ':path': '/' })
    reqStream.once('error', () => {})

    setTimeout(() => {
      reqStream.close(http2.constants.NGHTTP2_CANCEL)
      client.close()
    }, 50)

    await handled
  })

  it('on http2 response finished normally', async ({ onTestFinished }) => {
    const server = http2.createServer()
    onTestFinished(() => new Promise<any>(r => server.close(r)))

    const handled = new Promise<void>((resolve, reject) => {
      server.on('request', async (req, res) => {
        try {
          expect(canWriteToNodeResponse(res)).toBe(true)

          res.end('ok')

          await vi.waitFor(() => {
            expect(canWriteToNodeResponse(res)).toBe(false)
          })

          resolve()
        }
        catch (error) {
          reject(error)
        }
      })
    })

    await new Promise<void>(r => server.listen(0, r))
    const port = (server.address() as any).port

    const client = http2.connect(`http://localhost:${port}`)
    const reqStream = client.request({ ':path': '/' })
    reqStream.on('data', () => {})
    reqStream.once('end', () => client.close())

    await handled
  })
})

describe('getNodeResponseError', () => {
  it('on http1 response destroyed with an error', async ({ onTestFinished }) => {
    const server = http.createServer()
    onTestFinished(() => new Promise<any>(r => server.close(r)))

    const error = new Error('test')

    const handled = new Promise<void>((resolve, reject) => {
      server.on('request', async (req, res) => {
        try {
          expect(getNodeResponseError(res)).toBe(null)

          // catch error
          res.once('error', () => {})
          res.destroy(error)

          await new Promise<void>(r => res.once('close', () => r()))

          expect(getNodeResponseError(res)).toBe(error)

          resolve()
        }
        catch (error) {
          reject(error)
        }
      })
    })

    await new Promise<void>(r => server.listen(0, r))
    const port = (server.address() as any).port

    http.get(`http://localhost:${port}`, res => res.resume()).once('error', () => {})

    await handled
  })

  it('on http1 response finished normally', async ({ onTestFinished }) => {
    const server = http.createServer()
    onTestFinished(() => new Promise<any>(r => server.close(r)))

    const handled = new Promise<void>((resolve, reject) => {
      server.on('request', async (req, res) => {
        try {
          res.end('ok')

          await new Promise<void>(r => res.once('close', () => r()))

          expect(getNodeResponseError(res)).toBe(null)

          resolve()
        }
        catch (error) {
          reject(error)
        }
      })
    })

    await new Promise<void>(r => server.listen(0, r))
    const port = (server.address() as any).port

    http.get(`http://localhost:${port}`, res => res.resume())

    await handled
  })

  it('on http2 response destroyed with an error', async ({ onTestFinished }) => {
    const server = http2.createServer()
    onTestFinished(() => new Promise<any>(r => server.close(r)))

    const error = new Error('test')

    const handled = new Promise<void>((resolve, reject) => {
      server.on('request', async (req, res) => {
        try {
          expect(getNodeResponseError(res)).toBe(null)

          // catch error
          res.stream.once('error', () => {})
          res.stream.destroy(error)

          await new Promise<void>(r => res.stream.once('close', () => r()))

          expect(getNodeResponseError(res)).toBe(error)

          // `Http2ServerResponse` extends `Stream`, not `Writable`, so the error is only
          // reachable through the underlying `Http2Stream` - reading it off the response
          // itself silently yields `undefined`, despite what `@types/node` declares
          expect((res as any).errored).toBe(undefined)

          resolve()
        }
        catch (error) {
          reject(error)
        }
      })
    })

    await new Promise<void>(r => server.listen(0, r))
    const port = (server.address() as any).port

    const client = http2.connect(`http://localhost:${port}`)
    const reqStream = client.request({ ':path': '/' })
    reqStream.once('error', () => client.close())

    await handled
  })

  it('on http2 response finished normally', async ({ onTestFinished }) => {
    const server = http2.createServer()
    onTestFinished(() => new Promise<any>(r => server.close(r)))

    const handled = new Promise<void>((resolve, reject) => {
      server.on('request', async (req, res) => {
        try {
          res.end('ok')

          await new Promise<void>(r => res.stream.once('close', () => r()))

          expect(getNodeResponseError(res)).toBe(null)

          resolve()
        }
        catch (error) {
          reject(error)
        }
      })
    })

    await new Promise<void>(r => server.listen(0, r))
    const port = (server.address() as any).port

    const client = http2.connect(`http://localhost:${port}`)
    const reqStream = client.request({ ':path': '/' })
    reqStream.on('data', () => {})
    reqStream.once('end', () => client.close())

    await handled
  })
})
