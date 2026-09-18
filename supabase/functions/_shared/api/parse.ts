// Input parsing shared by the handlers. Every field is checked; nothing is
// defaulted into existence.

import { badRequest } from './context.ts';

type Raw = Partial<Record<string, unknown>>;

export const rawOf = (raw: unknown): Raw => (raw ?? {}) as Raw;

export function requireString(raw: Raw, key: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim() === '') throw badRequest(`${key} is required`);
  return value.trim();
}

export function optionalString(raw: Raw, key: string): string | undefined {
  const value = raw[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim() === '') throw badRequest(`${key} must be a name`);
  return value.trim();
}

export function optionalInt(raw: Raw, key: string): number | undefined {
  const value = raw[key];
  if (value === undefined || value === null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) throw badRequest(`${key} must be an integer`);
  return n;
}

export function requireStringList(raw: Raw, key: string): string[] {
  const value = raw[key];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw badRequest(`${key} must be a list of ids`);
  }
  return value as string[];
}
