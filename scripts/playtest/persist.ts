// Keeping dynasties between page loads, in this browser.
//
// The league goes through the versioned save document the server stores, so a
// dynasty written by one build is read by the next through the same migration
// chain. Everything that is a session rather than a league -- the schedule, the
// table, what has been played -- travels beside it.
//
// Three save files, like the product's. Each one carries a small header beside
// the document -- who manages it, what year, what record -- so the save-file
// screen can draw three cards without deserializing three leagues, which on a
// phone is three seconds of work to render a list.

import {
  deserialize, migrate, serialize, SAVE_SCHEMA_VERSION, type UnknownDocument,
} from '../../supabase/functions/_shared/save/index';
import {
  ledgerFromJson, ledgerToJson, type LedgerJson,
} from '../../supabase/functions/_shared/engine/news/index';
import { clubs } from './world';
import type { Game, Standing } from './host';
import type { SlotRow } from '../../supabase/functions/_shared/api/reads/slots';

export const SLOT_COUNT = 3;

const KEY = (slot: number): string => `dmp.playtest.v1.slot${String(slot)}`;

/** The single save the rig kept before it had files. */
const LEGACY_KEY = 'dmp.playtest.v1';

/** What a save-file card needs, written at save time rather than computed by
 *  opening the league. */
interface Header {
  readonly gmName: string | null;
  readonly teamId: string;
  readonly season: number;
  readonly week: number;
  readonly phase: Game['phase'];
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly savedAt: string;
}

interface Stored {
  readonly document: unknown;
  readonly userTeamId: string;
  readonly seed: number;
  readonly week: number;
  readonly weeks: number;
  readonly phase: Game['phase'];
  readonly schedule: Game['schedule'];
  readonly results: Game['results'];
  readonly seeds: Game['seeds'];
  readonly playoffs: Game['playoffs'];
  readonly standings: readonly (readonly [string, Standing])[];
  readonly news: Game['news'];
  readonly ledger: LedgerJson;
  readonly absence: readonly [string, number][];
  readonly depthChart: Game['depthChart'];
  readonly history: Game['history'];
  readonly awards: Game['awards'];
  readonly offers: Game['offers'];
  readonly draftOrder: Game['draftOrder'];
  readonly nextPick: number;
  readonly moves: Game['moves'];
  /** Absent on a save written before there were files. Its card then reports
   *  what it does not know rather than guessing (ARCHITECTURE.md rule 3). */
  readonly header?: Header;
}

export function persist(game: Game, slot: number, gmName: string | null): void {
  const mine = game.standings.get(game.userTeamId);
  try {
    const stored = {
      header: {
        gmName,
        teamId: game.userTeamId,
        season: game.season,
        week: game.week,
        phase: game.phase,
        wins: mine?.wins ?? 0,
        losses: mine?.losses ?? 0,
        ties: mine?.ties ?? 0,
        savedAt: new Date().toISOString(),
      } satisfies Header,
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
      seeds: game.seeds, playoffs: game.playoffs,
      standings: [...game.standings.entries()], news: game.news,
      ledger: ledgerToJson(game.ledger), absence: [...game.absence.entries()],
      depthChart: game.depthChart, history: game.history, awards: game.awards,
      offers: game.offers, draftOrder: game.draftOrder, nextPick: game.nextPick,
      moves: game.moves,
    };
    localStorage.setItem(KEY(slot), JSON.stringify(stored));
  } catch {
    // A full quota must not take the game down mid-season: it keeps running in
    // memory and is lost on refresh, which is visible and recoverable.
  }
}

function read(slot: number): Stored | null {
  try {
    const text = localStorage.getItem(KEY(slot));
    return text === null ? null : (JSON.parse(text) as Stored);
  } catch {
    return null;
  }
}

/** The GM whose name is on a file, or null where none was ever recorded. */
export function gmOf(slot: number): string | null {
  return read(slot)?.header?.gmName ?? null;
}

export function restore(slot: number): Game | null {
  const stored = read(slot);
  if (stored === null) return null;
  try {
    const { document } = migrate(stored.document as UnknownDocument);
    const { league } = deserialize(document);
    return {
      league, clubs: clubs(), userTeamId: stored.userTeamId, seed: stored.seed,
      season: league.season, week: stored.week, weeks: stored.weeks, phase: stored.phase,
      schedule: stored.schedule, results: stored.results,
      // A dynasty stored by a build without a postseason reopens with an
      // empty bracket rather than a wrong one.
      seeds: stored.seeds ?? [], playoffs: stored.playoffs ?? [],
      standings: new Map(stored.standings.map(([id, s]) => [id, { ...s }])),
      news: stored.news, ledger: ledgerFromJson(stored.ledger),
      absence: new Map(stored.absence), depthChart: stored.depthChart,
      history: stored.history, awards: stored.awards ?? [],
      // A dynasty stored before the offseason could be played reopens with
      // nothing in flight, which is what it had.
      offers: stored.offers ?? [], draftOrder: stored.draftOrder ?? [],
      nextPick: stored.nextPick ?? 1,
      moves: stored.moves, abandoned: [],
    };
  } catch {
    // A file this build cannot read is left where it is rather than deleted:
    // a later build may understand it, and throwing away someone's dynasty to
    // tidy up a list is not a trade this code gets to make.
    return null;
  }
}

export function clear(slot: number): void {
  try { localStorage.removeItem(KEY(slot)); } catch { /* nothing to do */ }
}

/**
 * The three files, as the save-file screen draws them.
 *
 * Anything a file does not record says so rather than being filled in: a save
 * written before there were files has no GM and no header, and reports both as
 * missing.
 */
export function slotRows(): SlotRow[] {
  return Array.from({ length: SLOT_COUNT }, (_, i): SlotRow => {
    const slot = i + 1;
    const stored = read(slot);
    if (stored === null) {
      return {
        slot, saveId: null, teamId: null, teamName: null, primary: null, secondary: null,
        gmName: null, season: null, week: null, phase: null,
        wins: null, losses: null, ties: null, savedAt: null,
      };
    }
    const header = stored.header;
    const teamId = header?.teamId ?? stored.userTeamId;
    const club = clubs().get(teamId);
    return {
      slot,
      saveId: String(slot),
      teamId,
      teamName: club?.name ?? null,
      primary: club?.primary ?? null,
      secondary: club?.secondary ?? null,
      gmName: header?.gmName ?? null,
      season: header?.season ?? null,
      week: header?.week ?? stored.week,
      phase: header?.phase ?? stored.phase,
      wins: header?.wins ?? null,
      losses: header?.losses ?? null,
      ties: header?.ties ?? null,
      savedAt: header?.savedAt ?? null,
    };
  });
}

/**
 * Move a dynasty saved by the build that had one nameless save into file 1.
 *
 * Run once at boot. Someone who was mid-season when this shipped keeps their
 * dynasty; it simply appears in the first file, with no GM recorded, which is
 * the truth about it.
 */
export function adoptLegacy(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === null) return;
    if (localStorage.getItem(KEY(1)) === null) localStorage.setItem(KEY(1), legacy);
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* nothing to do */ }
}

/**
 * What this browser is actually holding, for the database-tools screen.
 *
 * `bytes` is the length of the JSON written, which is a real measurement of
 * what was stored rather than an estimate of what the browser charges for it.
 */
export function storageReport(): {
  readonly used: number; readonly total: number; readonly bytes: number | null;
} {
  let bytes: number | null = 0;
  let used = 0;
  for (let slot = 1; slot <= SLOT_COUNT; slot += 1) {
    try {
      const text = localStorage.getItem(KEY(slot));
      if (text === null) continue;
      used += 1;
      if (bytes !== null) bytes += text.length;
    } catch {
      // Storage that cannot be read is reported as unknown, not as zero.
      bytes = null;
    }
  }
  return { used, total: SLOT_COUNT, bytes };
}

/** The save-document schema this build reads and writes. */
export const SCHEMA_VERSION = SAVE_SCHEMA_VERSION;
