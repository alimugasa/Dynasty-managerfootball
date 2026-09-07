// The development transport. A shim, nothing more.
//
// Route, parse, call the shared handler, serialize. There is no game logic and
// no SQL in this file, and scripts/lint-arch.mjs fails the build if either
// appears. Every handler lives in supabase/functions/_shared/api/ and is
// imported unchanged by supabase/functions/api/index.ts, the production edge
// function. If a change ever needs to touch only one of the two transports,
// that is a design failure to be reported, not a reason to split the logic.
//
//   DATABASE_URL=postgres://... DEV_USER_ID=<uuid> node scripts/dev-api.ts
//
// Identity: there is no auth server in development, so the shim trusts the
// DEV_USER_ID environment variable and an optional x-dev-user header. That
// trust is the difference between this file and the edge function, which
// verifies a real JWT -- and it is the reason this file must never be deployed.

import { createServer, type IncomingMessage } from 'node:http';
import { ApiError, dispatch } from '../supabase/functions/_shared/api/dispatch.ts';
import { connect } from '../supabase/functions/_shared/api/db.ts';

const PORT = Number(process.env['DEV_API_PORT'] ?? 8787);
const ORIGIN = process.env['DEV_API_ORIGIN'] ?? 'http://localhost:5173';
const DATABASE_URL = process.env['DATABASE_URL'];
const DEV_USER_ID = process.env['DEV_USER_ID'] ?? null;

if (DATABASE_URL === undefined) {
  // Rule 3: a missing configuration value is reported, never defaulted to a
  // database that happens to be lying around.
  process.stderr.write('dev-api: DATABASE_URL is not set\n');
  process.exit(2);
}

const sql = connect({ url: DATABASE_URL, max: 4 });

const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-dev-user',
  // One socket per request. Node closes an idle keep-alive socket after five
  // seconds, and a browser that reuses it at that instant gets a connection
  // reset on a POST it will not retry -- a week that silently did not play.
  // Development traffic is a handful of requests; the extra handshakes are
  // nothing, and the failure mode is gone.
  'Connection': 'close',
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { text += chunk; });
    req.on('end', () => { resolve(text); });
    req.on('error', reject);
  });
}

const server = createServer((req, res) => {
  void (async () => {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

    const name = (req.url ?? '/').replace(/^\/+|\/+$/g, '');
    const headerUser = req.headers['x-dev-user'];
    const userId = typeof headerUser === 'string' && headerUser !== '' ? headerUser : DEV_USER_ID;

    try {
      if (req.method !== 'POST') throw new ApiError(405, 'method', 'POST only');
      const text = await readBody(req);
      const raw: unknown = text === '' ? {} : JSON.parse(text);
      const out = await dispatch(name, raw, { sql, userId });
      res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      const code = error instanceof ApiError ? error.code : 'internal';
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(status, { ...CORS, 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: code, message }));
    }
  })();
});

server.listen(PORT, () => {
  process.stderr.write(`dev-api listening on http://localhost:${String(PORT)} (origin ${ORIGIN})\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void sql.end().then(() => { process.exit(0); });
  });
}
