// Paging.
//
// Every list read in this app is a page, including the ones that look small
// today. A roster is 53 rows and a week of fixtures is 16, but a transaction
// feed is 900 rows per season and a fifty-season save holds 45,000 of them; the
// screens are built from the same list components, so the read contract is the
// same shape everywhere and the caller cannot forget to bound one.
//
// Keyset, not offset. `offset 44000 limit 50` makes Postgres walk and discard
// 44,000 rows to return 50, so the last page of a long feed costs the most --
// exactly backwards. A keyset page carries the sort key of the last row it saw
// and seeks straight to it, so page 900 costs what page 1 costs. The price is
// that pages must be taken in order and the sort key must be unique, which is
// why every cursor below ends in a tiebreaker column that is unique per row.

/** Rows are capped even when a caller asks for more. A screen that wants 5,000
 *  rows at once has a design problem that a larger page size would hide. */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

export interface Page<T> {
  readonly rows: readonly T[];
  /** Opaque. Pass back verbatim for the next page; null when the list ends. */
  readonly cursor: string | null;
}

export interface PageRequest {
  readonly limit?: number;
  readonly cursor?: string | null;
}

export function pageSize(request: PageRequest | undefined): number {
  const asked = request?.limit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(asked) || asked < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.trunc(asked));
}

/**
 * A cursor is the sort key of the last row returned, not a row offset.
 *
 * Encoded rather than passed as a bare value so that a caller cannot construct
 * one by hand and cannot reuse a cursor from one sort order against another --
 * the key name travels with the value, and a mismatch is rejected rather than
 * silently returning a page from the wrong place in the list.
 */
export interface Cursor {
  readonly key: string;
  readonly values: readonly (string | number)[];
}

export function encodeCursor(cursor: Cursor): string {
  return btoa(JSON.stringify([cursor.key, ...cursor.values]));
}

export class CursorMismatch extends Error {
  readonly expected: string;
  readonly got: string;

  constructor(expected: string, got: string) {
    super(`Cursor is for "${got}", but this list is ordered by "${expected}"`);
    this.name = 'CursorMismatch';
    this.expected = expected;
    this.got = got;
  }
}

export function decodeCursor(encoded: string | null | undefined, key: string): Cursor | null {
  if (encoded === null || encoded === undefined || encoded === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(atob(encoded));
  } catch {
    // A corrupt cursor is a bug in the caller, not a reason to silently serve
    // page one: a list that quietly restarts looks like data loss to the user.
    throw new CursorMismatch(key, '<unreadable>');
  }
  if (!Array.isArray(parsed) || parsed.length < 2) throw new CursorMismatch(key, '<malformed>');
  const [got, ...values] = parsed as [string, ...(string | number)[]];
  if (got !== key) throw new CursorMismatch(key, got);
  return { key, values };
}

/**
 * Builds the page from one extra row.
 *
 * Reading limit + 1 rows and discarding the last is how "is there more" is
 * answered without a second COUNT query. A count over a 45,000-row feed to
 * decide whether to show a "load more" button is the query nobody notices
 * writing and everybody pays for.
 */
export function toPage<T>(
  rows: readonly T[], limit: number, cursorOf: (row: T) => Cursor,
): Page<T> {
  if (rows.length <= limit) return { rows, cursor: null };
  const visible = rows.slice(0, limit);
  const last = visible[visible.length - 1];
  return {
    rows: visible,
    cursor: last === undefined ? null : encodeCursor(cursorOf(last)),
  };
}
