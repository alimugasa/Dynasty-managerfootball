// Reading from the API, as a hook.
//
// Every screen read goes through here: one call, one loading state, one
// error. The screens never touch the client directly (lint-arch rule 2), and
// nothing is computed from game state in the browser -- a screen asks a named
// handler for exactly what it draws and renders what comes back.

import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from '../data/client';

interface Retryable {
  /** Runs the read again. On every state, not just the failed one: a screen
   *  holding a stale answer has as much right to ask for a fresh one as a
   *  screen holding none. */
  readonly retry: () => void;
}

export type Query<T> =
  | ({ readonly status: 'loading'; readonly data: null; readonly error: null } & Retryable)
  | ({ readonly status: 'ready'; readonly data: T; readonly error: null } & Retryable)
  | ({ readonly status: 'error'; readonly data: null; readonly error: Error } & Retryable);

/**
 * Fetches `route` with `input` and refetches when `version` changes -- the
 * SaveProvider bumps it after every write, so a screen showing last week's
 * table re-reads the moment the week is played. `enabled: false` holds the
 * query in loading without calling, for a screen that has no save yet.
 */
export function useQuery<T>(
  route: string, input: Record<string, unknown>, version: number, enabled = true,
): Query<T> {
  const [state, setState] = useState<Omit<Query<T>, 'retry'>>(
    { status: 'loading', data: null, error: null });
  // Bumped by retry(). Separate from `version`, which the SaveProvider owns and
  // every screen shares: asking one failed read to run again must not re-query
  // the whole app.
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setAttempt((n) => n + 1); }, []);
  const key = JSON.stringify(input);

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    setState({ status: 'loading', data: null, error: null });
    api().call<T>(route, JSON.parse(key) as Record<string, unknown>)
      .then((data) => { if (live) setState({ status: 'ready', data, error: null }); })
      .catch((error: unknown) => {
        if (!live) return;
        const e = error instanceof Error ? error : new Error(String(error));
        setState({ status: 'error', data: null, error: e });
      });
    return () => { live = false; };
  }, [route, key, version, attempt, enabled]);

  return { ...state, retry } as Query<T>;
}

export { ApiRequestError };
