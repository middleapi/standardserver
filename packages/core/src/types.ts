export interface StandardHeaders {
  [key: string]: string | string[] | undefined
}

export type StandardBody
  = | unknown // application/json
    | URLSearchParams // x-www-form-urlencoded
    | FormData // multipart/form-data
    | AsyncIterator<unknown | void, unknown | void, undefined> // text/event-stream
    | ReadableStream<Uint8Array<ArrayBuffer>> // binary stream
    | Blob // binary
    | undefined // empty

export interface StandardRequest {
  /**
   * The origin of the request.
   *
   * @example 'https://example.com'
   */
  origin?: string | undefined
  /**
   * @example '/path/to/resource'
   */
  pathname: string
  /**
   * @example new URLSearchParams('foo=bar&baz=qux')
   */
  query: URLSearchParams
  /**
   * @example 'GET', 'POST', etc.
   */
  method: string
  /**
   * @example { 'content-type': 'application/json' }
   */
  headers: StandardHeaders
  /**
   * The body has been parsed based on the content headers.
   */
  body: StandardBody
  /**
   * An AbortSignal to communicate aborting of request.
   */
  signal?: AbortSignal | undefined
}

export interface StandardLazyRequest extends Omit<StandardRequest, 'body'> {
  /**
   * The lazy-body has been parsed based on the content headers.
   */
  body: () => Promise<StandardBody>
}

export interface StandardResponse {
  /**
   * @example 200, 404, 500, etc.
   */
  status: number
  /**
   * @example { 'set-cookie': ['sessionId=abc123; HttpOnly'] }
   */
  headers: StandardHeaders
  /**
   * The body has been parsed based on the content headers.
   */
  body: StandardBody
}

export interface StandardLazyResponse extends Omit<StandardResponse, 'body'> {
  /**
   * The lazy-body has been parsed based on the content headers.
   */
  body: () => Promise<StandardBody>
}
