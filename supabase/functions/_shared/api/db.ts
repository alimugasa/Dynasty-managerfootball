// The one place the database driver is configured.
//
// Runtime-neutral by construction: this module reads no environment. The
// transport that hosts it -- scripts/dev-api.ts under Node, the edge function
// under Deno -- reads its own environment and hands the values in. That is what
// lets a handler be imported unchanged by both, which is the whole design.
//
// `postgres` (porsager) runs on Node, Bun, Deno and Workers from one codebase.
// Under Deno it is imported as `npm:postgres`; under Node as `postgres`.

import postgres from 'postgres';

export type Sql = ReturnType<typeof postgres>;

export interface DbConfig {
  /** A libpq-style URL, or omitted to use host/port/user/database below. */
  readonly url?: string;
  readonly host?: string;
  readonly port?: number;
  readonly user?: string;
  readonly password?: string;
  readonly database?: string;
  /** Connection-pool ceiling. Edge functions want 1; the dev shim can take more. */
  readonly max?: number;
}

/**
 * Parses a connection URL the way libpq does.
 *
 * The driver's own URL parsing ignores `?host=` and `?port=` entirely -- a
 * socket path in the query fell back to 127.0.0.1:5432 -- and the URL parser
 * rejects libpq's empty-host form outright. So the URL is decomposed here and
 * the driver is always given the object form, which it honours. This is the
 * only place the rule lives, and it serves Node and Deno alike.
 */
export function parseDatabaseUrl(url: string): DbConfig {
  const parsed = new URL(url);
  const q = parsed.searchParams;
  const host = q.get('host') ?? (parsed.hostname === '' ? undefined : parsed.hostname);
  const portText = q.get('port') ?? (parsed.port === '' ? undefined : parsed.port);
  const port = portText === undefined ? undefined : Number(portText);
  if (port !== undefined && !Number.isInteger(port)) {
    throw new Error(`DATABASE_URL port is not a number: ${portText ?? ''}`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  return {
    ...(host !== undefined ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(parsed.username !== '' ? { user: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password !== '' ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(database !== '' ? { database } : {}),
  };
}

export function connect(config: DbConfig): Sql {
  const options = { max: config.max ?? 4 };
  if (config.url !== undefined) return connect({ ...parseDatabaseUrl(config.url), max: options.max });
  return postgres({
    ...options,
    ...(config.host !== undefined ? { host: config.host } : {}),
    ...(config.port !== undefined ? { port: config.port } : {}),
    ...(config.user !== undefined ? { user: config.user } : {}),
    ...(config.password !== undefined ? { password: config.password } : {}),
    ...(config.database !== undefined ? { database: config.database } : {}),
  });
}
