// Where a computer-run club is short, and who it can spare.
//
// Split from cpuMarket.ts, which decides what a club does about it. Everything
// here counts and nothing here writes: how many men cannot play, which group
// is thinnest, how badly, and who is the least costly to lose. Kept apart
// because the counting is the part that has to be right -- a club that
// miscounts its cornerbacks signs the wrong player, and it does so quietly.

import type { Db } from './db.ts';
import type { SaveRow } from './save.ts';
import { GROUP_OF } from '../engine/careerWorld.ts';
import { POSITION_GROUPS, STARTERS, type PositionGroup } from '../engine/types.ts';

/** A group is thin when it cannot field its unit twice over. Below this a club
 *  is one injury from an abandoned fixture, which is the only thing in this
 *  game that actually forces a signing. */
export const THIN_MULTIPLE = 1.4;

/** How short a club has to be before it will release somebody to fix it. A
 *  club does not tear up its roster over a mild shortage; it does over a
 *  group it cannot field. */
export const ACUTE_NEED = 0.34;

/**
 * How many players a club can have unavailable before it goes looking.
 *
 * This is the trigger that makes the market a living thing rather than a
 * one-off, and it was missing from the first version. Every club in this
 * league carries exactly 53 men, so a rule that only fired on a positional
 * emergency fired once, in week two, and never again: rosters were full, needs
 * were mild, and thirty-one clubs sat out the rest of the season.
 *
 * What actually drives in-season signings in this sport is the treatment room.
 * A club with four men unavailable is a club playing forty-nine, and it signs
 * somebody -- not because any one position is in crisis, but because the
 * roster it is allowed to dress has a hole in it. This game does not model
 * injured reserve, so that shortfall is counted directly.
 */
export const SHORTHANDED_BY = 3;

/** How badly a club needs a group, 0-1, counting who is actually available. */
export async function groupNeed(
  db: Db, saveId: string, season: number, teamId: string, group: PositionGroup,
): Promise<number> {
  const positions = Object.keys(GROUP_OF).filter((p) => GROUP_OF[p] === group);
  if (positions.length === 0) return 0;
  const [row] = await db<{ available: string }[]>`
    select count(*)::text as available
      from public.team_rosters r
      join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
      left join public.player_injuries i
        on i.save_id = r.save_id and i.player_id = r.player_id
       and i.injured_season = ${season}
       and i.injured_week + i.weeks_out_estimate > (
         select week from public.saves where id = ${saveId})
     where r.save_id = ${saveId} and r.team_id = ${teamId}
       and p.position = any(${positions}::text[])
       and i.player_id is null`;
  const starters = STARTERS[group];
  if (starters === 0) {
    // A long snapper is needed or he is not; there is no depth chart for it.
    return Number(row?.available ?? 0) > 0 ? 0 : 1;
  }
  const available = Number(row?.available ?? 0);
  const wanted = starters * THIN_MULTIPLE;
  return Math.min(1, Math.max(0, (wanted - available) / wanted));
}

/** Every group this club is short at, worst first. */
export async function thinGroups(
  db: Db, saveId: string, season: number, teamId: string,
): Promise<readonly { group: PositionGroup; need: number }[]> {
  const out: { group: PositionGroup; need: number }[] = [];
  for (const group of POSITION_GROUPS) {
    const need = await groupNeed(db, saveId, season, teamId, group);
    if (need > 0) out.push({ group, need });
  }
  return out.sort((a, b) => b.need - a.need);
}

/** How many of a club's players cannot play this week. */
export async function shorthandedBy(db: Db, save: SaveRow, teamId: string): Promise<number> {
  const [row] = await db<{ n: string }[]>`
    select count(*)::text as n
      from public.team_rosters r
      join public.player_injuries i
        on i.save_id = r.save_id and i.player_id = r.player_id
     where r.save_id = ${save.id} and r.team_id = ${teamId}
       and i.injured_season = ${save.season}
       and i.injured_week + i.weeks_out_estimate > ${save.week}`;
  return Number(row?.n ?? 0);
}

/**
 * The group this club has fewest available bodies at, per body a base snap
 * asks for. Where a replacement is worth most when no single group is in
 * crisis and the club is simply carrying injuries.
 *
 * The need it reports is the shortfall against a comfortable room rather than
 * against the unit -- it is already known that no group is in crisis, so this
 * is a question about where the next man helps, not about where the emergency
 * is. Specialists are skipped: a club does not sign a third kicker because it
 * has four men in the treatment room.
 */
export async function leastStocked(
  db: Db, save: SaveRow, teamId: string,
): Promise<{ group: PositionGroup; need: number } | undefined> {
  let thinnest: { group: PositionGroup; ratio: number } | undefined;
  for (const group of POSITION_GROUPS) {
    if (STARTERS[group] === 0 || group === 'K' || group === 'P') continue;
    const ratio = await stockRatio(db, save, teamId, group);
    if (thinnest === undefined || ratio < thinnest.ratio) thinnest = { group, ratio };
  }
  if (thinnest === undefined) return undefined;
  return {
    group: thinnest.group,
    need: Math.min(1, Math.max(0, (THIN_MULTIPLE - thinnest.ratio) / THIN_MULTIPLE)),
  };
}

/** Available bodies at a group, as a multiple of what it takes to field it. */
export async function stockRatio(
  db: Db, save: SaveRow, teamId: string, group: PositionGroup,
): Promise<number> {
  const positions = Object.keys(GROUP_OF).filter((p) => GROUP_OF[p] === group);
  const [row] = await db<{ n: string }[]>`
    select count(*)::text as n
      from public.team_rosters r
      join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
      left join public.player_injuries i
        on i.save_id = r.save_id and i.player_id = r.player_id
       and i.injured_season = ${save.season}
       and i.injured_week + i.weeks_out_estimate > ${save.week}
     where r.save_id = ${save.id} and r.team_id = ${teamId}
       and p.position = any(${positions}::text[]) and i.player_id is null`;
  return Number(row?.n ?? 0) / Math.max(1, STARTERS[group]);
}

/**
 * The player a club can most afford to lose, from a group it is not short at.
 *
 * Never from the group it is trying to fill -- a club short at cornerback that
 * released a cornerback to sign one would be going backwards -- and never a
 * starter: the last man on the chart at the club's deepest position is the one
 * whose absence costs least, which is exactly what makes him the one to go.
 *
 * Null when there is nobody expendable, and the club simply carries its hole.
 * That is a real outcome and is left as one: a club with no fat to trim is a
 * club with a problem it cannot solve this week.
 */
export async function mostExpendable(
  db: Db, save: SaveRow, teamId: string, needed: PositionGroup,
): Promise<string | null> {
  const needyPositions = Object.keys(GROUP_OF).filter((p) => GROUP_OF[p] === needed);
  const [row] = await db<{ player_id: string }[]>`
    select r.player_id
      from public.team_rosters r
      join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
      left join public.team_depth_charts d
        on d.save_id = r.save_id and d.player_id = r.player_id
       and d.slot = any(${[...POSITION_GROUPS]}::text[])
     where r.save_id = ${save.id} and r.team_id = ${teamId}
       and not (p.position = any(${needyPositions}::text[]))
       -- Behind at least two others at his position: a starter is not spare.
       and coalesce(d.depth_order, 99) > 2
     order by p.overall_rating asc, r.player_id
     limit 1`;
  return row?.player_id ?? null;
}

