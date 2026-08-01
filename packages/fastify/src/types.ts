import type { FastifyReply, FastifyRequest, RawServerBase, RouteGenericInterface } from 'fastify'

/**
 * A fastify request from any raw server (http, https, http2, http2 secure) and any route generic.
 */
export type AnyFastifyRequest = FastifyRequest<RouteGenericInterface, RawServerBase>

/**
 * A fastify reply from any raw server (http, https, http2, http2 secure) and any route generic.
 */
export type AnyFastifyReply = FastifyReply<RouteGenericInterface, RawServerBase>
