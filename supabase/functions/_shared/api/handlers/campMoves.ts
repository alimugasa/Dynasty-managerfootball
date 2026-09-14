// The moves camp is made of: advance it, cut somebody, sign off the 53.
//
// All three take the save row's lock, like every other write that moves a
// season on, so two tabs cannot break camp twice or cut the same man twice.
//
// The rule these exist to enforce: a season does not start from an illegal
// roster. `advanceCamp` refuses to leave FINAL_CUTS while the club is over the
// limit and says by how many, and `finalizeRoster` is the only thing that
// writes the sign-off. Nothing else may set the phase to REGULAR_SEASON.

import { badRequest, type Handler, type HandlerContext } from '../context.ts';
import { ownedSave, touchSave, type SaveRow } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { parseSettings } from '../franchiseOptions.ts';
import type { Db } from '../db.ts';
import {
  cutsRemaining, isPreseasonPhase, nextPreseasonPhase, rosterFault, rosterIsLegal,
  rosterLimits, PRESEASON_WEEKS,
} from '../preseason.ts';
import { cutPlayer, cutTerms, requireCuttable, type CutTerms } from '../cutPlayer.ts';
import { playPreseasonWeek, writePreseasonSchedule, type PreseasonOutcome } from '../preseasonWeek.ts';
import { gradePreseason, writeEvaluations } from '../campEvaluation.ts';
import { finalRosterNews } from '../franchiseNews.ts';
import { insertNews } from '../news.ts';

interface SaveOnly { readonly saveId: string }

function locked<In extends SaveOnly, Out>(
  work: (tx: Db, save: SaveRow, input: In) => Promise<Out>,
): (ctx: HandlerContext, input: In) => Promise<Out> {
  return ({ sql, userId }, input) => sql.begin(async (tx) => {
    await tx`select 1 from public.saves where id = ${input.saveId} for update`;
    const save = await ownedSave(tx, userId, input.saveId);
    return work(tx, save, input);
  }) as Promise<Out>;
}

const rosterCount = async (db: Db, save: SaveRow): Promise<number> => {
  const [row] = await db<{ n: string }[]>`
    select count(*)::text as n from public.team_rosters
     where save_id = ${save.id} and team_id = ${save.user_team_id}`;
  return Number(row?.n ?? 0);
};

// ------------------------------------------------------------ advance camp

export interface CampStepOutcome {
  readonly phase: string;
  readonly week: number;
  readonly summary: string;
  /** Set when the step played a preseason game. */
  readonly game: PreseasonOutcome | null;
  /** Set when the step was refused, with how many cuts are still owed. */
  readonly blockedBy: string | null;
  readonly cutsRemaining: number;
}

export async function stepCamp(db: Db, save: SaveRow): Promise<CampStepOutcome> {
  if (!isPreseasonPhase(save.phase)) {
    throw badRequest(`Camp is not the phase this save is in (${save.phase.toLowerCase()})`);
  }
  const limits = rosterLimits(parseSettings(save.franchise_settings) ?? null);
  const count = await rosterCount(db, save);

  if (save.phase === 'TRAINING_CAMP') {
    // Camp opens the preseason: write the three rounds, grade everybody once
    // off the practice field, and move to the first game.
    const league = await db<{ team_id: string }[]>`
      select team_id from public.teams where save_id = ${save.id} order by team_id`;
    await writePreseasonSchedule(db, save.id, save.season, league.map((t) => t.team_id));
    await writeEvaluations(db, save.id, save.season, save.user_team_id,
      await gradePreseason(db, save.id, save.season, save.user_team_id));
    await touchSave(db, save.id, { week: 1, phase: 'PRESEASON' });
    return {
      phase: 'PRESEASON', week: 1,
      summary: `The preseason opens. ${String(PRESEASON_WEEKS)} games before the cut to `
        + `${String(limits.active)}.`,
      game: null, blockedBy: null, cutsRemaining: cutsRemaining(count, limits),
    };
  }

  if (save.phase === 'PRESEASON') {
    const game = await playPreseasonWeek(db, save);
    const next = nextPreseasonPhase('PRESEASON', save.week);
    const week = next === 'PRESEASON' ? save.week + 1 : save.week;
    await touchSave(db, save.id, { week, phase: next === 'PRESEASON' ? 'PRESEASON' : 'FINAL_CUTS' });
    const after = await rosterCount(db, save);
    return {
      phase: next === 'PRESEASON' ? 'PRESEASON' : 'FINAL_CUTS',
      week,
      summary: next === 'PRESEASON'
        ? `Preseason week ${String(save.week)} played. ${String(game.remaining)} to go.`
        : 'The preseason is over. Get the roster to its limit.',
      game,
      blockedBy: null,
      cutsRemaining: cutsRemaining(after, limits),
    };
  }

  // FINAL_CUTS. This is the gate: the season does not start over the limit.
  if (!rosterIsLegal(count, limits)) {
    return {
      phase: save.phase, week: save.week,
      summary: 'The roster is not ready.',
      game: null,
      blockedBy: rosterFault(count, limits),
      cutsRemaining: cutsRemaining(count, limits),
    };
  }
  throw badRequest('The roster is legal; finalize it to start the season');
}

export const advanceCamp: Handler<SaveOnly, CampStepOutcome> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: locked<SaveOnly, CampStepOutcome>((tx, save) => stepCamp(tx, save)),
};

// ------------------------------------------------------------- cut a player

interface CutIn extends SaveOnly { readonly playerId: string }

export interface CutOutcome extends CutTerms {
  readonly cutsRemaining: number;
  readonly rosterLimit: number;
}

export const previewCut: Handler<CutIn, CutOutcome> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), playerId: requireString(r, 'playerId') };
  },
  run: async ({ sql, userId }, input) => {
    const save = await ownedSave(sql, userId, input.saveId);
    const limits = rosterLimits(parseSettings(save.franchise_settings) ?? null);
    const terms = await cutTerms(sql, save.id, save.user_team_id, input.playerId);
    return {
      ...terms,
      cutsRemaining: cutsRemaining(terms.rosterAfter, limits),
      rosterLimit: limits.active,
    };
  },
};

export const releaseFromRoster: Handler<CutIn, CutOutcome> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), playerId: requireString(r, 'playerId') };
  },
  run: locked<CutIn, CutOutcome>(async (tx, save, input) => {
    requireCuttable(save);
    const limits = rosterLimits(parseSettings(save.franchise_settings) ?? null);
    const terms = await cutPlayer(tx, save, input.playerId);
    return {
      ...terms,
      cutsRemaining: cutsRemaining(terms.rosterAfter, limits),
      rosterLimit: limits.active,
    };
  }),
};

// ------------------------------------------------------------- finalize 53

export interface FinalizeOutcome {
  readonly finalized: boolean;
  readonly rosterCount: number;
  readonly rosterLimit: number;
  readonly fault: string | null;
  readonly phase: string;
}

export async function finalizeRoster(db: Db, save: SaveRow): Promise<FinalizeOutcome> {
  if (!isPreseasonPhase(save.phase)) {
    throw badRequest('There is no roster to finalize outside camp');
  }
  const limits = rosterLimits(parseSettings(save.franchise_settings) ?? null);
  const count = await rosterCount(db, save);
  const fault = rosterFault(count, limits);
  if (fault !== null) {
    return {
      finalized: false, rosterCount: count, rosterLimit: limits.active,
      fault, phase: save.phase,
    };
  }

  // The story of the month, written from the rows rather than from a tally
  // kept alongside them: who was cut, and what the 53 looks like.
  const cuts = await db<{ player_name: string; detail: string }[]>`
    select player_name, detail from public.transactions
     where save_id = ${save.id} and season = ${save.season}
       and kind = 'RELEASE' and team_id = ${save.user_team_id}
     order by transaction_id desc limit 40`;
  const [club] = await db<{ metro_area: string; nickname: string }[]>`
    select metro_area, nickname from public.teams
     where save_id = ${save.id} and team_id = ${save.user_team_id}`;
  const [shape] = await db<{ average_age: string; rookies: string }[]>`
    select round(avg(p.age), 1)::text as average_age,
           count(*) filter (where p.experience_years = 0)::text as rookies
      from public.team_rosters r
      join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
     where r.save_id = ${save.id} and r.team_id = ${save.user_team_id}`;

  if (club !== undefined) {
    await insertNews(db, save.id, [finalRosterNews({
      season: save.season,
      club: { teamId: save.user_team_id, metro: club.metro_area, nickname: club.nickname },
      rosterCount: count,
      rookies: Number(shape?.rookies ?? 0),
      averageAge: Number(shape?.average_age ?? 0),
      cutNames: cuts.map((c) => c.player_name),
      waived: cuts.filter((c) => c.detail.includes('waivers')).length,
    })]);
  }

  await db`
    update public.saves set roster_finalized_season = ${save.season} where id = ${save.id}`;
  await touchSave(db, save.id, { week: 1, phase: 'REGULAR_SEASON' });

  return {
    finalized: true, rosterCount: count, rosterLimit: limits.active,
    fault: null, phase: 'REGULAR_SEASON',
  };
}

export const finalize53: Handler<SaveOnly, FinalizeOutcome> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: locked<SaveOnly, FinalizeOutcome>((tx, save) => finalizeRoster(tx, save)),
};
