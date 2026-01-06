export interface StandardHeaders {
  [key: string]: string | string[] | undefined
}

export type StandardBodyHint
  = | 'json' // application/json
    | 'form-data' // multipart/form-data
    | 'url-search-params' // application/x-www-form-urlencoded
    | 'event-stream' // text/event-stream
    | 'octet-stream' // generic binary stream (any content-type)
    | 'file' // binary - file is also a blob (any content-type)
    | 'none' // undefined (any content-type)

export type StandardBody
  = | unknown // application/json
    | URLSearchParams // x-www-form-urlencoded
    | FormData // multipart/form-data
    | AsyncIterator<unknown | void, unknown | void, undefined> // text/event-stream
    | ReadableStream<Uint8Array<ArrayBuffer>> // generic binary stream (any content-type)
    | Blob // binary - file is also a blob (any content-type)
    | undefined // empty (any content-type)

export interface StandardRequest {
  /**
   * @example 'GET', 'POST', etc.
   */
  method: string
  /**
   * @example new URL('https://example.com')
   *
   * If the request is not bound to a concrete network origin
   * and is expected to be resolved by another layer,
   * use `UNBOUND_ORIGIN` (`http://unbound.invalid`).
   */
  url: URL
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
  body: (hint?: StandardBodyHint | undefined) => Promise<StandardBody>
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
  body: (hint?: StandardBodyHint | undefined) => Promise<StandardBody>
}
