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
  /** The build step that failed, where the failure happened inside one. Lets
   *  the world screen say which step went wrong rather than showing a message
   *  and hoping the player can place it. */
  readonly step?: string;
}

/** An error the transport should turn into an HTTP status rather than a 500. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Set only on a failure that happened inside a named build step. */
  readonly step: string | undefined;

  constructor(status: number, code: string, message: string, step?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.step = step;
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
