// What the other thirty-one clubs do about the wire and the market.
//
// A computer-run club works the market for one reason: somebody it needs is
// hurt, or a group is thin enough that the next injury would leave it unable
// to field a unit. It does not troll the pool for upgrades every week -- a
// league where thirty-one clubs sign the best available player every Tuesday
// would churn a third of its rosters by December, and the manager would be
// playing against a different league every week.
//
// What a club wants when it does look is the request's own rule, and it is the
// one place a contender and a rebuild genuinely differ: a club in the race
// replaces a starter with somebody who has done it before, and a club going
// nowhere would rather find out what a 24-year-old is. Both read the same
// pool; they rank it differently. That is replacementScore, and it lives in
// inSeasonMarket.ts with the rest of the model.

import type { Db } from './db.ts';
import type { SaveRow } from './save.ts';
import { GROUP_OF } from '../engine/careerWorld.ts';
import type { PositionGroup } from '../engine/types.ts';
import { capRules } from '../engine/offseason/frontOffice.ts';
import {
  cpuOffer, inSeasonAsk, replacementScore, signingProbability, desiredLength,
  ACCEPT_THRESHOLD, type ClubOffer,
} from './inSeasonMarket.ts';
import { ACTIVE_ROSTER_LIMIT, teamCapSpace, teamRosterCount } from './rosterSpace.ts';
import {
  ACUTE_NEED, SHORTHANDED_BY, groupNeed, leastStocked, mostExpendable,
  shorthandedBy, thinGroups,
} from './cpuNeeds.ts';
import { marketPlayer, signPlayer } from './signFreeAgent.ts';
import { submitClaim } from './waivers.ts';
import { releaseFrom } from './cutPlayer.ts';
import { clubNames, logMoves, money, type Move, type MoveContext } from './transactionLog.ts';

export interface ClubContext {
  readonly teamId: string;
  /** 0-1: how close this club is to competing this season. */
  readonly contention: number;
  /** 0-1: how badly it needs the position asked about. */
  readonly need: number;
  readonly contending: boolean;
  readonly capSpace: number;
  readonly rosterCount: number;
}

/**
 * Where a club stands, and how badly it needs a position.
 *
 * Contention comes from the table once there is a table worth reading, and
 * from the club's own rating against the league's before that. The second is a
 * derivation and is named as one: a club with no record has no record, and
 * guessing 0.5 for everybody would make every club equally attractive to every
 * free agent in September, which is exactly the month the wire is busiest.
 */
export async function clubContext(
  db: Db, saveId: string, season: number, teamId: string, position: string | null,
): Promise<ClubContext> {
  const [standing] = await db<{ wins: number; losses: number; ties: number; win_pct: string }[]>`
    select wins, losses, ties, win_pct::text from public.standings
     where save_id = ${saveId} and season = ${season} and team_id = ${teamId}`;
  const played = (standing?.wins ?? 0) + (standing?.losses ?? 0) + (standing?.ties ?? 0);

  let contention: number;
  if (played >= 3) {
    contention = Number(standing?.win_pct ?? 0);
  } else {
    const [rating] = await db<{ mine: string | null; league: string | null }[]>`
      select
        (select avg(p.overall_rating) from public.team_rosters r
           join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
          where r.save_id = ${saveId} and r.team_id = ${teamId})::text as mine,
        (select avg(p.overall_rating) from public.team_rosters r
           join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
          where r.save_id = ${saveId})::text as league`;
    const mine = Number(rating?.mine ?? 0);
    const mean = Number(rating?.league ?? 0);
    // Six rating points either side of the league's mean spans the whole
    // range: the gap between the best and worst rosters in this engine is
    // about that, so a wider span would put every club in the middle.
    contention = mean === 0 ? 0 : Math.min(1, Math.max(0, 0.5 + (mine - mean) / 12));
  }

  const need = position === null
    ? 0
    : await groupNeed(db, saveId, season, teamId, GROUP_OF[position] ?? 'LS');

  return {
    teamId, contention, need,
    // A club at or above .500, or rated above the league before a table
    // exists. Everything else is finding out what it has.
    contending: contention >= 0.5,
    capSpace: await teamCapSpace(db, saveId, season, teamId),
    rosterCount: await teamRosterCount(db, saveId, teamId),
  };
}

interface CandidateRow {
  player_id: string; position: string; overall_rating: number;
  potential_rating: number; age: number; experience_years: number;
  market_asking_aav: string | null;
}

/**
 * One round of the market for every computer-run club.
 *
 * Runs after a week is played, when the injuries that create the need have
 * just been recorded. A club signs at most one player a week: a club that
 * signed five would be rebuilding itself out of the pool, and the pool is
 * finite.
 */
export async function cpuMarketRound(
  db: Db, save: SaveRow, week: number, seasonWeeks: number,
): Promise<readonly Move[]> {
  const rules = capRules(save.season);
  const clubs = await db<{ team_id: string }[]>`
    select team_id from public.teams
     where save_id = ${save.id} and team_id <> ${save.user_team_id}
     order by team_id`;
  const moves: Move[] = [];

  for (const { team_id: teamId } of clubs) {
    const thin = await thinGroups(db, save.id, save.season, teamId);
    const short = await shorthandedBy(db, save, teamId);
    // The group it is thinnest at, or -- when nothing is actually thin and it
    // is simply carrying injuries -- the group it has fewest available at,
    // which is where a replacement does the most good.
    const worst = thin[0] ?? (short >= SHORTHANDED_BY
      ? await leastStocked(db, save, teamId)
      : undefined);
    if (worst === undefined) continue;
    if (worst.need < ACUTE_NEED && short < SHORTHANDED_BY) continue;


    let ctx = await clubContext(db, save.id, save.season, teamId, null);

    // A club at the limit has to make room before it can do anything, and
    // every club in this league sits at exactly 53 -- which is why the first
    // version of this function did nothing at all, for thirty-one clubs, all
    // season. It was not that they decided against signing anybody; they were
    // never asked. A club with a hole it cannot fill releases from a group it
    // is deep at, which is the same trade a real front office makes.
    if (ctx.rosterCount >= ACTIVE_ROSTER_LIMIT) {
      const spare = await mostExpendable(db, save, teamId, worst.group);
      if (spare === null) continue;
      await releaseFrom(db, save, teamId, spare);
      ctx = await clubContext(db, save.id, save.season, teamId, null);
      if (ctx.rosterCount >= ACTIVE_ROSTER_LIMIT) continue;
    }

    // The wire first: a claim costs nothing but a place in the queue, and a
    // club with a hole would rather have the player than the priority.
    await claimIfWorthIt(db, save, teamId, worst.group, ctx.contending);

    const positions = Object.keys(GROUP_OF).filter((p) => GROUP_OF[p] === worst.group);
    const candidates = await db<CandidateRow[]>`
      select f.player_id, f.position, p.overall_rating, p.potential_rating,
             f.age, f.experience_years, f.market_asking_aav::text as market_asking_aav
        from public.free_agents f
        join public.players p on p.save_id = f.save_id and p.player_id = f.player_id
       where f.save_id = ${save.id} and p.team_id is null and p.retired_season is null
         and f.position = any(${positions}::text[])
       order by p.overall_rating desc
       limit 12`;
    if (candidates.length === 0) continue;

    const ranked = [...candidates].sort((a, b) =>
      replacementScore({
        overall: b.overall_rating, potential: b.potential_rating,
        age: b.age, experienceYears: b.experience_years,
      }, ctx.contending)
      - replacementScore({
        overall: a.overall_rating, potential: a.potential_rating,
        age: a.age, experienceYears: a.experience_years,
      }, ctx.contending));

    for (const candidate of ranked) {
      const player = await marketPlayer(db, save.id, save.season, candidate.player_id);
      const ask = inSeasonAsk(player, week, seasonWeeks, rules.veteranMinimum);
      const aav = cpuOffer(ask, worst.need, ctx.capSpace, rules.veteranMinimum);
      if (aav === null) break;
      const years = desiredLength(player);
      const offer: ClubOffer = {
        teamId, aav, years, role: player.desiredRole,
        need: worst.need, contention: ctx.contention, capSpace: ctx.capSpace,
      };
      if (signingProbability(player, offer, ask) < ACCEPT_THRESHOLD) continue;
      await signPlayer(db, save, teamId, player, aav, years);
      moves.push({
        kind: 'FREE_AGENT_SIGNING', teamId, playerId: player.playerId,
        playerName: player.name, position: player.position,
        overall: candidate.overall_rating, capImpact: aav,
        fromTeamId: player.previousTeamId,
        detail: `${String(years)} year${years === 1 ? '' : 's'} at ${money(aav)} a year`,
      });
      break;
    }
  }
  return moves;
}

/** A club with a hole puts a claim in on the best player on the wire who fills
 *  it. Whether it gets him is the queue's business, not this function's. */
async function claimIfWorthIt(
  db: Db, save: SaveRow, teamId: string, group: PositionGroup, contending: boolean,
): Promise<void> {
  const positions = Object.keys(GROUP_OF).filter((p) => GROUP_OF[p] === group);
  const rows = await db<CandidateRow[]>`
    select w.player_id, p.position, p.overall_rating, p.potential_rating,
           p.age, p.experience_years, null::text as market_asking_aav
      from public.waiver_wire w
      join public.players p on p.save_id = w.save_id and p.player_id = w.player_id
     where w.save_id = ${save.id} and w.season = ${save.season} and w.state = 'OPEN'
       and w.deadline_week > ${save.week} and w.from_team_id <> ${teamId}
       and p.position = any(${positions}::text[])
     order by p.overall_rating desc
     limit 5`;
  const best = [...rows].sort((a, b) =>
    replacementScore({
      overall: b.overall_rating, potential: b.potential_rating,
      age: b.age, experienceYears: b.experience_years,
    }, contending)
    - replacementScore({
      overall: a.overall_rating, potential: a.potential_rating,
      age: a.age, experienceYears: a.experience_years,
    }, contending))[0];
  if (best === undefined) return;
  try {
    await submitClaim(db, save.id, save.season, save.week, teamId, best.player_id);
  } catch {
    // A club with no priority set, or a window that shut between the read and
    // the write. Neither is worth failing a week over, and the claim simply
    // does not happen.
  }
}

/** Writes what the computer-run clubs did. */
export async function logCpuMoves(
  db: Db, save: SaveRow, moves: readonly Move[],
): Promise<void> {
  if (moves.length === 0) return;
  const ctx: MoveContext = {
    saveId: save.id, season: save.season, week: save.week, phase: save.phase,
    userTeamId: save.user_team_id, clubNames: await clubNames(db, save.id),
  };
  await logMoves(db, ctx, moves);
}
