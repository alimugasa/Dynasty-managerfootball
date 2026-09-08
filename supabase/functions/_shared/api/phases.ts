// Where an offseason is, and what the manager has decided so far.
//
// Small on purpose: both ways through an offseason read this -- the stepped
// path and the one-shot that finishes whatever is left of one -- and neither
// should have to import the other to ask what phase a save is in.

import type { Db } from './db.ts';
import { badRequest } from './context.ts';
import { rngSeed32, type SaveRow } from './save.ts';
import { PostgresSaveStore } from './saveStore.ts';
import { serialize } from '../save/index.ts';
import { ENGINE_VERSION } from './createSave.ts';
import type { League, UserOffer } from '../engine/offseason/index.ts';
import type { TransactionCounts } from './project/transactions.ts';

export const OFFSEASON_PHASES = [
  'OFFSEASON', 'RETIREMENTS', 'DRAFT', 'FREE_AGENCY', 'CAMP',
] as const;
export type OffseasonPhase = (typeof OFFSEASON_PHASES)[number];

export const PHASE_LABEL: Readonly<Record<OffseasonPhase, string>> = {
  OFFSEASON: 'Season review',
  RETIREMENTS: 'Contracts',
  DRAFT: 'The draft',
  FREE_AGENCY: 'Free agency',
  CAMP: 'Camp',
};

/** What each step's button says, and what pressing it does next. */
export const PHASE_ACTION: Readonly<Record<OffseasonPhase, string>> = {
  OFFSEASON: 'Close the season',
  RETIREMENTS: 'Open the draft',
  DRAFT: 'Advance the draft',
  FREE_AGENCY: 'Open the market',
  CAMP: 'Break camp',
};

export const isOffseasonPhase = (phase: string): phase is OffseasonPhase =>
  (OFFSEASON_PHASES as readonly string[]).includes(phase);

/**
 * Decisions in flight. Not league state: the document is what the league is,
 * and this is what the manager is in the middle of doing to it.
 */
export interface OffseasonState {
  readonly offers: readonly UserOffer[];
  /** Fixed when the draft opens, because a club's strength changes as the
   *  draft fills its holes and a re-derived order would not be the one the
   *  first round was made in. */
  readonly draftOrder: readonly string[];
  /** The next overall pick to be made. */
  readonly nextPick: number;
  /** Settled totals carried to the end, so camp can report the whole winter. */
  readonly counts: readonly TransactionCounts[];
  readonly retired: number;
  readonly coachesFired: number;
  readonly headCoachBefore: string | null;
}

export const EMPTY_STATE: OffseasonState = {
  offers: [], draftOrder: [], nextPick: 1, counts: [],
  retired: 0, coachesFired: 0, headCoachBefore: null,
};

export async function readState(db: Db, saveId: string): Promise<OffseasonState> {
  const [row] = await db<{ offseason: OffseasonState | null }[]>`
    select offseason from public.save_documents where save_id = ${saveId}`;
  return row?.offseason === null || row?.offseason === undefined
    ? EMPTY_STATE
    : { ...EMPTY_STATE, ...row.offseason };
}

export async function writeState(db: Db, saveId: string, state: OffseasonState): Promise<void> {
  await db`
    update public.save_documents set offseason = ${JSON.stringify(state)}::text::jsonb
     where save_id = ${saveId}`;
}

/** The league, written back at the end of a step that changed it. */
export async function saveLeague(
  db: Db, save: SaveRow, league: League, phase: string,
): Promise<void> {
  const now = new Date().toISOString();
  await new PostgresSaveStore(db).write(save.id, serialize(league, {
    meta: {
      saveId: save.id, name: save.name, userTeamId: save.user_team_id,
      season: league.season, week: save.week, phase,
      seed: rngSeed32(save.rng_seed), engineVersion: ENGINE_VERSION,
      createdAt: now, updatedAt: now,
    },
  }));
}

export function requireOffseason(save: SaveRow, expected?: OffseasonPhase): OffseasonPhase {
  if (!isOffseasonPhase(save.phase)) {
    throw badRequest(
      `The ${String(save.season)} offseason has not started `
      + `(${save.phase.toLowerCase().replace('_', ' ')})`);
  }
  if (expected !== undefined && save.phase !== expected) {
    throw badRequest(`That belongs to ${PHASE_LABEL[expected].toLowerCase()}, and the offseason is at ${PHASE_LABEL[save.phase].toLowerCase()}`);
  }
  return save.phase;
}

