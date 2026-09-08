// The offseason, on the server.
//
// Four stages, in the order they happen: the season is closed and settled, the
// draft is held, the market opens, camp cuts everyone to the limit and the
// calendar turns over. Each one is a function here, and there are two ways
// through them.
//
//   advance-season      runs all four in one call. What a test, a report and a
//                       manager in a hurry use.
//   the stepped path    runs one at a time, saving between them, so a manager
//                       can make his own picks and offers (offseason.ts).
//
// One implementation, two orders of arrival: a decision the stepped path
// exposes is a parameter the one-shot leaves empty, never a second copy of the
// same football.
//
// The transaction log is the engine's own report of what it did, joined to a
// diff of the league taken at the start of that stage. It names what happened;
// it does not guess a kind for a move the engine did not report (an expired
// contract is not a release, and is not logged as one).

import type { Db } from './db.ts';
import { badRequest } from './context.ts';
import { rngSeed32, touchSave, type SaveRow } from './save.ts';
import { loadEngineState, PostgresSaveStore, writeLedger } from './saveStore.ts';
import {
  defaultDepthChart, projectWorld, seedStandings, writeDepthChart,
} from './project/index.ts';
import {
  draftedMap, logTransactions, recordDraft, snapshotPlayers,
  type PlayerBefore, type TransactionCounts,
} from './project/transactions.ts';
export { settleSeasonStage, type SettleOutcome } from './season/settle.ts';
import { settleSeasonStage } from './season/settle.ts';
import { createRng } from '../engine/rng.ts';
import { writeSchedule } from './season/close.ts';
import { OFFSEASON_STREAMS } from './season/streams.ts';
import {
  buildIndex, campStage, draftStage, marketStage,
  type DraftResult, type DraftStageOptions, type FreeAgencyResult,
  type League, type UserOffer,
} from '../engine/offseason/index.ts';
import { createLedger } from '../engine/news/index.ts';
import { isOffseasonPhase, OFFSEASON_PHASES, readState } from './phases.ts';
import { serialize } from '../save/index.ts';
import { ENGINE_VERSION } from './createSave.ts';

/** Seasons of per-game lines kept beside the current one. See 0017. */
export const GAME_LINE_RETENTION = 3;

export interface SeasonOutcome {
  readonly season: number;
  readonly week: number;
  readonly phase: string;
  readonly retired: number;
  readonly drafted: number;
  readonly signed: number;
  /** Rows written to transactions, by kind. */
  readonly transactions: TransactionCounts;
  /** Head coaches who lost their job this winter. */
  readonly coachesFired: number;
  /** True when the club you manage changed head coach. */
  readonly newHeadCoach: boolean;
}

/**
 * What the winter did, in the numbers camp reports at the end of it.
 *
 * Carried rather than recomputed because a stepped offseason settles in one
 * request and breaks camp in another: by then the settle stage's own result is
 * three requests out of memory, and the totals are all camp needs from it.
 */
export interface WinterTotals {
  readonly retired: number;
  readonly coachesFired: number;
  readonly headCoachBefore: string | null;
}

/** Stage two: the draft, in full or up to the manager's next pick. */
export async function draftStageOn(
  db: Db, save: SaveRow, league: League, options: DraftStageOptions = {},
): Promise<{ draft: DraftResult; transactions: TransactionCounts }> {
  const { id: saveId, season } = save;
  const seed32 = rngSeed32(save.rng_seed);
  const before = snapshotPlayers(league);
  const draft = draftStage(
    league,
    createRng(OFFSEASON_STREAMS.draft(seed32, season, options.startAt ?? 1)),
    options);
  await projectWorld(db, saveId, league, {
    previousIds: new Set(before.keys()), drafted: draftedMap(draft),
  });
  await recordDraft(db, saveId, league, draft);
  const transactions = await logTransactions(db, saveId, season, league, before, { draft });
  return { draft, transactions };
}

/** Stage three: the market, with the manager's offers in it. */
export async function marketStageOn(
  db: Db, save: SaveRow, league: League, offers: readonly UserOffer[] = [],
): Promise<{ market: FreeAgencyResult; transactions: TransactionCounts }> {
  const { id: saveId, season } = save;
  const seed32 = rngSeed32(save.rng_seed);
  const before = snapshotPlayers(league);
  const market = marketStage(league, createRng(OFFSEASON_STREAMS.market(seed32, season)), offers);
  await projectWorld(db, saveId, league, { previousIds: new Set(before.keys()) });
  const transactions = await logTransactions(db, saveId, season, league, before, {
    freeAgency: market,
  });
  return { market, transactions };
}

/**
 * Stage four: camp, and the year turns over.
 *
 * Every roster is made legal, the unsigned are pruned, and the new season gets
 * a calendar, an opening table and a depth chart. This is the stage that moves
 * the save into September, so it is also the one that writes the document.
 */
export async function campStageOn(
  db: Db, save: SaveRow, league: League, winter: WinterTotals,
  earlier: readonly TransactionCounts[],
): Promise<SeasonOutcome> {
  const { id: saveId, season } = save;
  const seed32 = rngSeed32(save.rng_seed);
  const before = snapshotPlayers(league);
  const released = campStage(league, createRng(OFFSEASON_STREAMS.camp(seed32, season)));
  if (league.season !== season + 1) {
    throw new Error(`The offseason left the league at ${String(league.season)}, expected ${String(season + 1)}`);
  }

  await projectWorld(db, saveId, league, { previousIds: new Set(before.keys()) });
  const campCounts = await logTransactions(db, saveId, season, league, before, { released });

  await writeSchedule(db, saveId, league.season, league.teamIds, seed32);
  await seedStandings(db, saveId, league.season, league.teamIds);
  await writeDepthChart(db, saveId, save.user_team_id, defaultDepthChart(league, save.user_team_id));

  await touchSave(db, saveId, { season: league.season, week: 1, phase: 'REGULAR_SEASON' });
  // The career totals and the record book were rebuilt when the season was
  // settled, which is when they stopped changing. Only the pruning belongs
  // here: it drops the oldest per-game lines, and it must come after anything
  // that reads them.
  await db`select public.prune_player_game_stats(${saveId}::uuid, ${GAME_LINE_RETENTION})`;

  const now = new Date().toISOString();
  await new PostgresSaveStore(db).write(saveId, serialize(league, {
    meta: {
      saveId, name: save.name, userTeamId: save.user_team_id,
      season: league.season, week: 1, phase: 'REGULAR_SEASON',
      seed: seed32, engineVersion: ENGINE_VERSION, createdAt: now, updatedAt: now,
    },
  }));
  await writeLedger(db, saveId, createLedger(league.season));
  await db`update public.save_documents set offseason = null where save_id = ${saveId}`;

  const transactions: Record<string, number> = {};
  for (const counts of [...earlier, campCounts]) {
    for (const [kind, n] of Object.entries(counts)) transactions[kind] = (transactions[kind] ?? 0) + n;
  }
  const headAfter = league.coaches.find(
    (c) => c.teamId === save.user_team_id && c.role === 'HEAD_COACH')?.id ?? null;
  return {
    season: league.season, week: 1, phase: 'REGULAR_SEASON',
    retired: winter.retired,
    drafted: transactions['DRAFT_SELECTION'] ?? 0,
    signed: (transactions['FREE_AGENT_SIGNING'] ?? 0) + (transactions['RE_SIGNING'] ?? 0),
    transactions,
    coachesFired: winter.coachesFired,
    newHeadCoach: winter.headCoachBefore !== headAfter,
  };
}

/**
 * The rest of the offseason, in one call.
 *
 * From the end of a season it runs the whole winter. From the middle of one a
 * manager has been playing -- he has re-signed two players and does not want
 * to sit through the draft -- it runs the stages he has not reached yet, in
 * the same order, with the decisions he has already made left standing. There
 * is one way through an offseason; this is the impatient way of walking it.
 */
export async function advanceSeason(db: Db, save: SaveRow): Promise<SeasonOutcome> {
  if (!isOffseasonPhase(save.phase)) {
    throw badRequest(
      `The ${String(save.season)} season is not complete `
      + `(${save.phase.toLowerCase().replace('_', ' ')}, week ${String(save.week)})`);
  }
  const from = OFFSEASON_PHASES.indexOf(save.phase);
  const { league } = await loadEngineState(db, save.id);
  const state = await readState(db, save.id);
  const counts: TransactionCounts[] = [...state.counts];
  let winter: WinterTotals = {
    retired: state.retired,
    coachesFired: state.coachesFired,
    headCoachBefore: state.headCoachBefore,
  };

  if (from <= OFFSEASON_PHASES.indexOf('OFFSEASON')) {
    const settled = await settleSeasonStage(db, save, league);
    counts.push(settled.transactions);
    winter = {
      retired: settled.settle.retired.length,
      coachesFired: settled.coachesFired,
      headCoachBefore: settled.headCoachBefore,
    };
  }
  if (from <= OFFSEASON_PHASES.indexOf('DRAFT')) {
    // Whatever is left of the draft: from the top when it never opened, and
    // from the pick it stopped at when the manager walked away mid-round.
    const drafted = await draftStageOn(db, save, league, {
      ...(state.draftOrder.length === 0 ? {} : { order: state.draftOrder }),
      ...(from === OFFSEASON_PHASES.indexOf('DRAFT') ? { startAt: state.nextPick } : {}),
    });
    counts.push(drafted.transactions);
  }
  if (from <= OFFSEASON_PHASES.indexOf('FREE_AGENCY')) {
    const market = await marketStageOn(db, save, league, state.offers);
    counts.push(market.transactions);
  }
  return campStageOn(db, save, league, winter, counts);
}

export type { PlayerBefore };
export { buildIndex };
