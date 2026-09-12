// What every handler receives, and the errors it may raise.

import type { Sql } from './db.ts';

export interface HandlerContext {
  readonly sql: Sql;
  /** The authenticated user. Null only for handlers that declare they need none. */
  readonly userId: string | null;
}

/** What a failed call looks like on the wire. Both transports write this and
 *  the client reads it; it is declared once so they cannot drift. */
export interface ApiErrorBody {
  readonly error: string;
  readonly message: string;
}

/** An error the transport should turn into an HTTP status rather than a 500. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const unauthorized = (): ApiError =>
  new ApiError(401, 'unauthorized', 'No authenticated user on this request');
export const badRequest = (message: string): ApiError =>
  new ApiError(400, 'bad_request', message);
export const notFound = (what: string): ApiError =>
  new ApiError(404, 'not_found', `${what} not found`);

/** A handler: transport-neutral, takes parsed input, returns plain data. */
export interface Handler<In, Out> {
  readonly auth: 'required' | 'none';
  readonly parse: (raw: unknown) => In;
  readonly run: (ctx: HandlerContext, input: In) => Promise<Out>;
}
