// Paging.

import { describe, expect, it } from 'vitest';
import {
  CursorMismatch, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, decodeCursor, encodeCursor,
  pageSize, toPage,
} from '../../src/data/page';
import { READS, pagedReads, readSpec } from '../../src/data/queries';

interface Row { id: number; season: number }
const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, season: 2075 - i }));
const cursorOf = (r: Row) => ({ key: 'feed', values: [r.season, r.id] });

describe('page size', () => {
  it('defaults when unasked', () => {
    expect(pageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSize({})).toBe(DEFAULT_PAGE_SIZE);
  });

  it('caps what a caller may ask for', () => {
    // The point of the cap: a screen that asks for everything gets a page.
    expect(pageSize({ limit: 100_000 })).toBe(MAX_PAGE_SIZE);
  });

  it('refuses a nonsense limit rather than passing it to SQL', () => {
    expect(pageSize({ limit: 0 })).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSize({ limit: -5 })).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSize({ limit: Number.NaN })).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe('cursors', () => {
  it('round-trip', () => {
    const c = { key: 'feed', values: [2075, 44_000] };
    expect(decodeCursor(encodeCursor(c), 'feed')).toEqual(c);
  });

  it('are rejected against a different sort order', () => {
    // The failure this prevents: paging a feed sorted by date with a cursor
    // taken from the same feed sorted by importance, which silently returns a
    // page from the wrong place in the list.
    const c = encodeCursor({ key: 'byImportance', values: [5, 12] });
    expect(() => decodeCursor(c, 'feed')).toThrow(CursorMismatch);
  });

  it('treat a corrupt cursor as an error, not as page one', () => {
    // Silently restarting a list looks like data loss to the reader.
    expect(() => decodeCursor('not-base64!!', 'feed')).toThrow(CursorMismatch);
  });

  it('absent cursor means the start', () => {
    expect(decodeCursor(null, 'feed')).toBeNull();
    expect(decodeCursor(undefined, 'feed')).toBeNull();
    expect(decodeCursor('', 'feed')).toBeNull();
  });
});

describe('building a page', () => {
  it('ends the list when the extra row is absent', () => {
    const page = toPage(rows(50), 50, cursorOf);
    expect(page.rows).toHaveLength(50);
    expect(page.cursor).toBeNull();
  });

  it('drops the probe row and hands back a cursor', () => {
    // limit + 1 is how "is there more" is answered without a COUNT.
    const page = toPage(rows(51), 50, cursorOf);
    expect(page.rows).toHaveLength(50);
    expect(page.cursor).not.toBeNull();
    expect(decodeCursor(page.cursor, 'feed')?.values).toEqual([2026, 49]);
  });

  it('walks a long list without repeating or skipping a row', () => {
    // 45,000 transactions is a real fifty-season figure.
    const all = rows(45_000);
    const seen: number[] = [];
    let from = 0;
    for (let guard = 0; guard < 1000; guard += 1) {
      const slice = all.slice(from, from + 51);
      const page = toPage(slice, 50, cursorOf);
      for (const r of page.rows) seen.push(r.id);
      if (page.cursor === null) break;
      from += 50;
    }
    expect(seen).toHaveLength(45_000);
    expect(new Set(seen).size).toBe(45_000);
  });
});

describe('the read contract', () => {
  it('gives every read a bound', () => {
    for (const read of READS) {
      expect(read.bound, read.id).toBeDefined();
      expect(read.servedBy, `${read.id} names no index`).not.toBe('');
    }
  });

  it('has unique ids', () => {
    expect(new Set(READS.map((r) => r.id)).size).toBe(READS.length);
  });

  it('pages every read of a table that grows without limit', () => {
    // transactions and news accumulate for the life of the save. A read of
    // either that is not PAGED is the defect this list exists to catch.
    const unbounded = ['transactions', 'news'];
    for (const read of READS) {
      if (!unbounded.includes(read.table)) continue;
      expect(read.bound, `${read.id} reads ${read.table} unpaged`).toBe('PAGED');
    }
    expect(pagedReads().length).toBeGreaterThan(0);
  });

  it('serves every history read from a summary table', () => {
    // PER_SEASON is only legal when the read returns one row per season. A
    // PER_SEASON read of player_season_stats returns one row per season for one
    // player; of game_results it would return 288 per season, which is the
    // unbounded club-history read the audit found.
    const allowed = ['team_season_summary', 'player_season_stats'];
    for (const read of READS) {
      if (read.bound !== 'PER_SEASON') continue;
      expect(allowed, `${read.id} folds ${read.table} on every open`)
        .toContain(read.table);
    }
  });

  it('resolves a known id and rejects an unknown one', () => {
    expect(readSpec('team.history')?.table).toBe('team_season_summary');
    expect(readSpec('nope')).toBeUndefined();
  });
});
