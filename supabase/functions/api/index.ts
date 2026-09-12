// The production transport: a Supabase edge function. A shim, nothing more.
//
// Identical in shape to scripts/dev-api.ts -- route, parse, call the shared
// handler, serialize -- and importing the same handlers from _shared/api/. The
// one real difference is identity: here the user comes from the JWT Supabase
// Auth issued, verified by the gateway before this code runs, rather than from
// a development environment variable.
//
// Runs under Deno. Not executed in this repository's Node test suite; checked
// by `deno check` where Deno is installed. The Deno global is declared below
// with exactly the surface this file uses, so the Node tsconfig can typecheck
// it without suppressing anything. deno.json beside this file maps the bare
// `postgres` specifier db.ts imports onto npm:postgres for the Deno runtime.

import { ApiError, dispatch } from '../_shared/api/dispatch.ts';
import { connect } from '../_shared/api/db.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

const sql = connect({ url: Deno.env.get('SUPABASE_DB_URL') ?? '', max: 1 });

Deno.serve(async (req: Request) => {
  const name = new URL(req.url).pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');

  // The gateway has already verified the JWT; the subject is the user.
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const userId = token === '' ? null : subjectOf(token);

  try {
    if (req.method !== 'POST') throw new ApiError(405, 'method', 'POST only');
    const text = await req.text();
    const raw: unknown = text === '' ? {} : JSON.parse(text);
    const out = await dispatch(name, raw, { sql, userId });
    return Response.json(out);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = error instanceof ApiError ? error.code : 'internal';
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: code, message }, { status });
  }
});

/** The `sub` claim of an already-verified JWT. Decoded, not verified: the
 *  Supabase gateway rejects an invalid token before the function is invoked. */
function subjectOf(token: string): string | null {
  const [, payload] = token.split('.');
  if (payload === undefined) return null;
  try {
    const json: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const sub = (json as { sub?: unknown }).sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}
