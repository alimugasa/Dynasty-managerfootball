// What a club is, for the purpose of being negotiated with.
//
// evaluateTrade in tradeInterest.ts takes a TradeContext and decides; this
// builds one out of the rows. Every field is read or counted rather than
// assumed, including the one that most invites assumption: which players a
// club will not trade at any price.
//
// That list is the difference between an opponent and a spreadsheet. A club
// with no untouchables will sell its franchise quarterback for enough
// third-round picks, and once a manager finds that out the whole system stops
// being a negotiation and starts being an arithmetic puzzle.

import type { Db } from './db.ts';
import { parseSettings } from './franchiseOptions.ts';
import { GROUP_OF } from '../engine/careerWorld.ts';
import { STARTERS, type PositionGroup } from '../engine/types.ts';
import { ACTIVE_ROSTER_LIMIT, teamCapSpace, teamRosterCount } from './rosterSpace.ts';
import { strategyFor, type ClubShape, type Strategy } from './tradeStrategy.ts';
import type { TradeContext } from './tradeInterest.ts';
import { GROUP_LABEL } from './tradeAssets.ts';

/** A player this good, this young, at a position this valuable, is not for
 *  sale -- the same judgement a real front office makes in one sentence. */
const UNTOUCHABLE_OVERALL = 86;
const UNTOUCHABLE_AGE = 28;

/** The rating a starting unit is measured against, and how far below it counts
 *  as desperate. The engine's own numbers (offseason/needs.ts), so a club's
 *  needs mean the same thing in a trade as they do in free agency. */
const ADEQUATE = 76;
const NEED_RANGE = 22;
/** A position with nobody available is not an empty average, it is a hole. */
const EMPTY_SLOT = 40;

export interface ClubTradeContext extends TradeContext {
  readonly teamId: string;
  readonly name: string;
  readonly strategy: Strategy;
  readonly record: { readonly wins: number; readonly losses: number; readonly ties: number };
  /** What a screen says about why this club is where it is. */
  readonly needLabels: readonly string[];
}

export async function clubTradeContext(
  db: Db, saveId: string, season: number, week: number, seasonWeeks: number,
  teamId: string, settings: unknown,
): Promise<ClubTradeContext> {
  const [team] = await db<{ metro_area: string; nickname: string }[]>`
    select metro_area, nickname from public.teams
     where save_id = ${saveId} and team_id = ${teamId}`;
  const [standing] = await db<{ wins: number; losses: number; ties: number }[]>`
    select wins, losses, ties from public.standings
     where save_id = ${saveId} and season = ${season} and team_id = ${teamId}`;

  const [ratings] = await db<{ mine: string | null; league: string | null; age: string | null }[]>`
    select
      (select avg(p.overall_rating) from public.team_rosters r
         join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
        where r.save_id = ${saveId} and r.team_id = ${teamId})::text as mine,
      (select avg(p.overall_rating) from public.team_rosters r
         join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
        where r.save_id = ${saveId})::text as league,
      (select avg(p.age) from public.team_rosters r
         join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
        where r.save_id = ${saveId} and r.team_id = ${teamId})::text as age`;

  const shape: ClubShape = {
    wins: standing?.wins ?? 0, losses: standing?.losses ?? 0, ties: standing?.ties ?? 0,
    ratingEdge: Number(ratings?.mine ?? 0) - Number(ratings?.league ?? 0),
    averageAge: Number(ratings?.age ?? 26),
    week, seasonWeeks,
  };
  const strategy = strategyFor(shape);
  const needs = await clubNeeds(db, saveId, teamId);
  const untouchable = await untouchables(db, saveId, teamId, strategy);
  const parsed = parseSettings(settings);

  return {
    teamId,
    name: team === undefined ? teamId : `${team.metro_area} ${team.nickname}`,
    strategy,
    record: {
      wins: shape.wins, losses: shape.losses, ties: shape.ties,
    },
    needs,
    capSpace: await teamCapSpace(db, saveId, season, teamId),
    rosterCount: await teamRosterCount(db, saveId, teamId),
    rosterLimit: ACTIVE_ROSTER_LIMIT,
    untouchable,
    difficulty: parsed?.tradeDifficulty ?? 'NORMAL',
    needLabels: Object.entries(needs)
      .filter(([, n]) => n >= 0.55)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([group]) => GROUP_LABEL[group as PositionGroup] ?? group),
  };
}

/**
 * How badly a club needs each position group, 0-1.
 *
 * Measured on the men who would actually start there -- the mean of the top
 * few, where "few" is how many the group puts on the field -- rather than on
 * the best one alone.
 *
 * That distinction is the whole usefulness of this function. Judged on the
 * best player only, every club in a freshly generated league has somebody
 * adequate at every position, so every club reports no needs, and a Browse
 * Teams list of thirty-one clubs all saying "no pressing needs" tells a
 * manager nothing about who to call. A club whose best cornerback is 79 and
 * whose second is 61 has a real problem at cornerback, and it is the problem
 * a trade fixes.
 */
export async function clubNeeds(
  db: Db, saveId: string, teamId: string,
): Promise<Readonly<Record<string, number>>> {
  const rows = await db<{ position: string; overall_rating: number }[]>`
    select p.position, p.overall_rating
      from public.team_rosters r
      join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
      -- A man who cannot play is not filling the position this week, which is
      -- exactly when a club goes looking for another one.
      left join public.player_injuries i
        on i.save_id = r.save_id and i.player_id = r.player_id
       and i.injured_week + i.weeks_out_estimate
           > (select week from public.saves where id = ${saveId})
       and i.injured_season = (select season from public.saves where id = ${saveId})
     where r.save_id = ${saveId} and r.team_id = ${teamId} and i.player_id is null
     order by p.overall_rating desc`;

  const byGroup = new Map<PositionGroup, number[]>();
  for (const row of rows) {
    const group = GROUP_OF[row.position];
    if (group === undefined) continue;
    const list = byGroup.get(group) ?? [];
    list.push(row.overall_rating);
    byGroup.set(group, list);
  }

  const needs: Record<string, number> = {};
  for (const [group, starters] of Object.entries(STARTERS) as [PositionGroup, number][]) {
    if (starters === 0) continue;
    const rated = byGroup.get(group) ?? [];
    // The unit as it would take the field. A missing body counts as a hole
    // rather than being left out of the average, or a club with one great
    // corner and nobody else would read as set at cornerback.
    const unit: number[] = [];
    for (let i = 0; i < starters; i += 1) unit.push(rated[i] ?? EMPTY_SLOT);
    const mean = unit.reduce((a, b) => a + b, 0) / starters;
    // ADEQUATE is a starter; well below it is a hole. Between them it scales.
    needs[group] = Math.round(
      Math.min(1, Math.max(0, (ADEQUATE - mean) / NEED_RANGE)) * 100) / 100;
  }
  return needs;
}

/**
 * Who this club will not trade.
 *
 * A short list on purpose. Too many and nothing moves; none at all and a
 * manager learns that enough late picks buy anybody, which is the exploit that
 * ends a trade system's life. The rule is the one a front office would give in
 * a sentence: a young star at a position that matters is not available, and
 * a club going nowhere is more willing to listen than one going somewhere.
 */
export async function untouchables(
  db: Db, saveId: string, teamId: string, strategy: Strategy,
): Promise<ReadonlySet<string>> {
  // A full rebuild will listen on anybody. That is what a full rebuild is, and
  // it is also what makes one worth calling.
  if (strategy === 'FULL_REBUILD') return new Set();
  const threshold = strategy === 'REBUILD' ? UNTOUCHABLE_OVERALL + 4 : UNTOUCHABLE_OVERALL;
  const rows = await db<{ player_id: string }[]>`
    select p.player_id
      from public.team_rosters r
      join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
     where r.save_id = ${saveId} and r.team_id = ${teamId}
       and p.overall_rating >= ${threshold} and p.age <= ${UNTOUCHABLE_AGE}
       -- The positions a club builds around. A 90-rated punter is available.
       and p.position = any(${['QB', 'EDGE', 'OT', 'LT', 'RT', 'WR', 'CB', 'DT', 'G', 'C']}::text[])`;
  return new Set(rows.map((r) => r.player_id));
}
