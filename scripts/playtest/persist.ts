// Keeping the dynasty between page loads, in this browser.
//
// The league goes through the versioned save document the server stores, so a
// dynasty written by one build is read by the next through the same migration
// chain. Everything that is a session rather than a league -- the schedule, the
// table, what has been played -- travels beside it.

import {
  deserialize, migrate, serialize, SAVE_SCHEMA_VERSION, type UnknownDocument,
} from '../../supabase/functions/_shared/save/index';
import {
  ledgerFromJson, ledgerToJson, type LedgerJson,
} from '../../supabase/functions/_shared/engine/news/index';
import { clubs } from './world';
import type { Game, Standing } from './host';

const KEY = 'dmp.playtest.v1';

interface Stored {
  readonly document: unknown;
  readonly userTeamId: string;
  readonly seed: number;
  readonly week: number;
  readonly weeks: number;
  readonly phase: Game['phase'];
  readonly schedule: Game['schedule'];
  readonly results: Game['results'];
  readonly standings: readonly (readonly [string, Standing])[];
  readonly news: Game['news'];
  readonly ledger: LedgerJson;
  readonly absence: readonly [string, number][];
  readonly depthChart: Game['depthChart'];
  readonly history: Game['history'];
  readonly moves: Game['moves'];
}

export function persist(game: Game): void {
  try {
    const stored = {
      document: serialize(game.league, {
        meta: {
          saveId: 'playtest', name: 'Play-test dynasty', userTeamId: game.userTeamId,
          season: game.season, week: game.week, phase: game.phase, seed: game.seed,
          engineVersion: String(SAVE_SCHEMA_VERSION),
          createdAt: new Date(0).toISOString(), updatedAt: new Date().toISOString(),
        },
      }),
      userTeamId: game.userTeamId, seed: game.seed, week: game.week, weeks: game.weeks,
      phase: game.phase, schedule: game.schedule, results: game.results,
      standings: [...game.standings.entries()], news: game.news,
      ledger: ledgerToJson(game.ledger), absence: [...game.absence.entries()],
      depthChart: game.depthChart, history: game.history, moves: game.moves,
    };
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // A full quota must not take the game down mid-season: it keeps running in
    // memory and is lost on refresh, which is visible and recoverable.
  }
}

export function restore(): Game | null {
  let stored: Stored;
  try {
    const text = localStorage.getItem(KEY);
    if (text === null) return null;
    stored = JSON.parse(text) as Stored;
  } catch {
    return null;
  }
  try {
    const { document } = migrate(stored.document as UnknownDocument);
    const { league } = deserialize(document);
    return {
      league, clubs: clubs(), userTeamId: stored.userTeamId, seed: stored.seed,
      season: league.season, week: stored.week, weeks: stored.weeks, phase: stored.phase,
      schedule: stored.schedule, results: stored.results,
      standings: new Map(stored.standings.map(([id, s]) => [id, { ...s }])),
      news: stored.news, ledger: ledgerFromJson(stored.ledger),
      absence: new Map(stored.absence), depthChart: stored.depthChart,
      history: stored.history, moves: stored.moves, abandoned: [],
    };
  } catch {
    clear();
    return null;
  }
}

export function clear(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}
