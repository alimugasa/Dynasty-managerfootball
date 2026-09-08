// The offseason a manager plays through.
//
// advance-season runs the whole winter in one call and always will. This is
// the other way through the same four stages (rollover.ts), stopping wherever
// there is something to decide:
//
//   OFFSEASON    the season just ended: read the recap, then settle it
//   RETIREMENTS  who left, who is out of contract: re-sign, release, trade
//   DRAFT        your picks, made by you when your turn comes round
//   FREE_AGENCY  your offers, taken into the market with everyone else's
//   CAMP         cut to the limit, the calendar written, September
//
// Each step is one transaction ending with the league written back, so the
// browser can be closed between any two of them. What the manager has decided
// but not yet committed -- his offers, the draft order, the pick the draft is
// waiting on -- lives in save_documents.offseason (0023), because none of it
// is league state.

import type { Db } from './db.ts';
import { touchSave, type SaveRow } from './save.ts';
import { loadEngineState } from './saveStore.ts';
import { buildIndex, strengthOrder } from '../engine/offseason/index.ts';
import {
  EMPTY_STATE, readState, requireOffseason, saveLeague, writeState,
} from './phases.ts';
import {
  campStageOn, draftStageOn, marketStageOn, settleSeasonStage, type SeasonOutcome,
} from './rollover.ts';
export interface StepOutcome {
  readonly phase: string;
  readonly season: number;
  /** Set when the draft stopped and is waiting on the manager. */
  readonly waitingOnPick: { readonly overall: number; readonly round: number } | null;
  /** Set by the step that ends the offseason. */
  readonly seasonStarted: SeasonOutcome | null;
  readonly summary: string;
}

/** Settles the season and opens the contract phase. */
async function stepSettle(db: Db, save: SaveRow): Promise<StepOutcome> {
  const { league } = await loadEngineState(db, save.id);
  const settled = await settleSeasonStage(db, save, league);
  await saveLeague(db, save, league, 'RETIREMENTS');
  await writeState(db, save.id, {
    ...EMPTY_STATE,
    counts: [settled.transactions],
    retired: settled.settle.retired.length,
    coachesFired: settled.coachesFired,
    headCoachBefore: settled.headCoachBefore,
  });
  await touchSave(db, save.id, { phase: 'RETIREMENTS' });
  return {
    phase: 'RETIREMENTS', season: save.season, waitingOnPick: null, seasonStarted: null,
    summary: `${String(settled.settle.retired.length)} retired, `
      + `${String(settled.settle.expired.length)} out of contract, `
      + `${String(settled.coachesFired)} head coaches let go`,
  };
}

/** Opens the draft: the order is fixed here and kept. */
async function stepOpenDraft(db: Db, save: SaveRow): Promise<StepOutcome> {
  const { league } = await loadEngineState(db, save.id);
  const order = strengthOrder(league, buildIndex(league.teamIds, league.players));
  const state = await readState(db, save.id);
  await writeState(db, save.id, { ...state, draftOrder: [...order], nextPick: 1 });
  await touchSave(db, save.id, { phase: 'DRAFT' });
  return {
    phase: 'DRAFT', season: save.season, waitingOnPick: null, seasonStarted: null,
    summary: 'The draft is open',
  };
}

/** Runs the draft up to the manager's next pick, or to the end. */
async function stepDraft(db: Db, save: SaveRow): Promise<StepOutcome> {
  const { league } = await loadEngineState(db, save.id);
  const state = await readState(db, save.id);
  const { draft, transactions } = await draftStageOn(db, save, league, {
    order: state.draftOrder,
    startAt: state.nextPick,
    choices: { teamId: save.user_team_id, stopForUser: true },
  });
  const paused = draft.paused;
  const phase = paused === null ? 'FREE_AGENCY' : 'DRAFT';
  await saveLeague(db, save, league, phase);
  await writeState(db, save.id, {
    ...state,
    nextPick: paused === null ? state.nextPick : paused.overall,
    counts: [...state.counts, transactions],
  });
  await touchSave(db, save.id, { phase });
  return {
    phase, season: save.season,
    waitingOnPick: paused === null ? null : { overall: paused.overall, round: paused.round },
    seasonStarted: null,
    summary: paused === null
      ? `${String(draft.picks.length)} picks made; the draft is over`
      : `On the clock: round ${String(paused.round)}, pick ${String(paused.overall)}`,
  };
}

/** Opens the market with the manager's offers in it. */
async function stepMarket(db: Db, save: SaveRow): Promise<StepOutcome> {
  const { league } = await loadEngineState(db, save.id);
  const state = await readState(db, save.id);
  const { market, transactions } = await marketStageOn(db, save, league, state.offers);
  await saveLeague(db, save, league, 'CAMP');
  const mine = market.signings.filter((s) => s.teamId === save.user_team_id).length;
  await writeState(db, save.id, {
    ...state, offers: [], counts: [...state.counts, transactions],
  });
  await touchSave(db, save.id, { phase: 'CAMP' });
  return {
    phase: 'CAMP', season: save.season, waitingOnPick: null, seasonStarted: null,
    summary: `${String(market.signings.length)} signings across the league, `
      + `${String(mine)} of them yours`,
  };
}

/** Camp, and the year turns over. */
async function stepCamp(db: Db, save: SaveRow): Promise<StepOutcome> {
  const { league } = await loadEngineState(db, save.id);
  const state = await readState(db, save.id);
  const outcome = await campStageOn(db, save, league, {
    retired: state.retired,
    coachesFired: state.coachesFired,
    headCoachBefore: state.headCoachBefore,
  }, state.counts);
  return {
    phase: 'REGULAR_SEASON', season: outcome.season, waitingOnPick: null,
    seasonStarted: outcome,
    summary: `${String(outcome.season)} is open`,
  };
}

/** One step forward, whatever the offseason is at. */
export async function stepOffseason(db: Db, save: SaveRow): Promise<StepOutcome> {
  const phase = requireOffseason(save);
  if (phase === 'OFFSEASON') return stepSettle(db, save);
  if (phase === 'RETIREMENTS') return stepOpenDraft(db, save);
  if (phase === 'DRAFT') return stepDraft(db, save);
  if (phase === 'FREE_AGENCY') return stepMarket(db, save);
  return stepCamp(db, save);
}
