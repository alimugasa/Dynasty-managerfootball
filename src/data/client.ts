// The API client.
//
// Not a Supabase client. lint-arch rule 3 reserves the identifier createClient
// for the one supabase-js instance this file may one day hold; this factory is
// an HTTP wrapper over the API and is named so it cannot be mistaken for that.
//
// Talks to the transport -- dev shim or edge function -- which is the only
// route to game state. There is no Postgres here and no direct table access:
// the client is read-only by architecture (ARCHITECTURE.md rule 2), and even
// its reads go through named handlers so the query shape is decided once, on
// the server, and reviewed there.

import { readEnv } from '../lib/env';
import type { ApiErrorBody } from '../../supabase/functions/_shared/api/context';

export interface ApiClient {
  call<Out>(route: string, input?: unknown): Promise<Out>;
}

export interface ApiFailure {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

export class ApiRequestError extends Error implements ApiFailure {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

export interface ClientOptions {
  readonly apiUrl: string;
  /** Development identity for the shim. Ignored by the edge function. */
  readonly devUserId?: string;
  readonly fetchImpl?: typeof fetch;
}

export function createApi(options: ClientOptions): ApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async call<Out>(route: string, input: unknown = {}): Promise<Out> {
      const response = await fetchImpl(`${options.apiUrl}/${route}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.devUserId === undefined ? {} : { 'x-dev-user': options.devUserId }),
        },
        body: JSON.stringify(input),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        // Typed against the transport's own declaration of the failure shape.
        const failure = body as Partial<ApiErrorBody>;
        throw new ApiRequestError(
          response.status, failure.error ?? 'unknown', failure.message ?? response.statusText);
      }
      return body as Out;
    },
  };
}

/**
 * The app's instance, built from the environment on first use rather than at
 * import: a module that threw on import would take down every screen that
 * merely imported it, and rule 3 wants the missing variable named at the
 * moment something actually asks for the API.
 */
let instance: ApiClient | null = null;
export function api(): ApiClient {
  if (instance === null) instance = createApi({ apiUrl: readEnv().apiUrl });
  return instance;
}
