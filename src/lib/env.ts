// Runtime configuration, validated once.
//
// Referenced by .env.example since the scaffold and never built until now.
// Rule 3 applies to configuration as much as to data: a missing value is
// named and refused, never defaulted to something that happens to work on one
// machine.

export interface Env {
  /** Where the API lives. The dev shim in development; the edge function
   *  gateway in production. */
  readonly apiUrl: string;
}

function required(name: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local.`);
  }
  return value;
}

export function readEnv(source: Record<string, string | undefined> = import.meta.env): Env {
  return {
    apiUrl: required('VITE_API_URL', source['VITE_API_URL']).replace(/\/+$/, ''),
  };
}
