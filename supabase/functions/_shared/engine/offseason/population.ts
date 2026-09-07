// The league as a population: rosters, the pool, and one full offseason.
//
// Ability moves only here, so this loop reproduces the league's talent dynamics
// without simulating a single game. legacy/ENGINE.md relies on exactly that to
// isolate drift: game simulation does not move ratings, so if the mean is
// sliding, the cause is in this file and not in the box score.

import { OFFSEASON } from './calibration.ts';
import { developAll, NEUTRAL_CONTEXT, type DevelopmentContext } from './development.ts';
import { developProspects, generateClass, type IntakeConfig } from './draftClass.ts';
import { gradeSeason } from './grading.ts';
import { retireAll } from './retirement.ts';
import { POSITION_GROUPS, type PositionGroup } from '../types.ts';
import type { Rng } from '../rng.ts';
import type { CareerPlayer, OffseasonSummary, Prospect, SeasonGrade } from './types.ts';

/** Roster shape, 53 players. Fixed so supply and demand stay aligned and a club
 *  cannot answer a shortage at one position by carrying eleven of another. */
export const ROSTER_QUOTA: Readonly<Record<PositionGroup, number>> = {
  QB: 3, RB: 4, WR: 7, TE: 3, OL: 10,
  EDGE: 4, DT: 4, LB: 6, CB: 6, S: 4, K: 1, P: 1,
};

export const ROSTER_SIZE = POSITION_GROUPS.reduce((n, g) => n + ROSTER_QUOTA[g], 0);

/**
 * How wrong the league collectively is about a prospect, in rating points.
 *
 * A single consensus estimate rather than thirty-two separate boards: this loop
 * exists to measure talent flow, and per-club boards change who signs whom
 * without changing how much talent enters. The full draft engine models the
 * boards; here the noise only needs to stop selection from being perfect,
 * because perfect selection would put the intake ceiling above anything a real
 * league achieves.
 */
const SCOUTING_NOISE_SD = 7.5;

export interface League {
  readonly teamIds: readonly string[];
  /** Every player still in the game, rostered or not. */
  players: CareerPlayer[];
  /** Classes not yet drafted, keyed by their draft year. */
  pipeline: Map<number, Prospect[]>;
  season: number;
}

export function rosterOf(league: League, teamId: string): CareerPlayer[] {
  return league.players.filter((p) => !p.retired && p.teamId === teamId);
}

/** Mean ability of rostered players: the number that must stay flat. */
export function meanRosteredAbility(league: League): number {
  const rostered = league.players.filter((p) => !p.retired && p.teamId !== null);
  if (rostered.length === 0) return NaN;
  let sum = 0;
  for (const p of rostered) sum += p.ability;
  return sum / rostered.length;
}

export function meanRosteredAge(league: League): number {
  const rostered = league.players.filter((p) => !p.retired && p.teamId !== null);
  if (rostered.length === 0) return NaN;
  let sum = 0;
  for (const p of rostered) sum += p.age;
  return sum / rostered.length;
}

function prospectToPlayer(prospect: Prospect): CareerPlayer {
  return {
    id: prospect.id,
    name: prospect.name,
    group: prospect.group,
    teamId: null,
    ability: prospect.ability,
    potential: prospect.potential,
    mental: 0,
    reputation: prospect.ability,
    age: prospect.age,
    experience: 0,
    devRate: prospect.devRate,
    workEthic: prospect.workEthic,
    durability: prospect.durability,
    footballIq: prospect.footballIq,
    gamesMissedCareer: 0,
    gamesMissedSeason: 0,
    accolades: { allLeague: 0, awards: 0, rings: 0 },
    retired: false,
    retiredInSeason: null,
  };
}

/**
 * Fill every roster to quota from the available pool.
 *
 * Per group rather than per club, because the quotas are identical: the set of
 * players who end up rostered is the top N at each position by estimated
 * ability, whichever club holds them. Which club matters enormously to a season
 * and not at all to the league's talent level, which is what this loop measures.
 */
export function fillRosters(league: League, rng: Rng): number {
  let signed = 0;
  for (const group of POSITION_GROUPS) {
    const quota = ROSTER_QUOTA[group];
    const rostered = new Map<string, CareerPlayer[]>();
    for (const teamId of league.teamIds) rostered.set(teamId, []);
    const available: CareerPlayer[] = [];

    for (const player of league.players) {
      if (player.retired || player.group !== group) continue;
      if (player.teamId === null) available.push(player);
      else rostered.get(player.teamId)?.push(player);
    }

    // Clubs cut down to quota before signing, worst first.
    for (const teamId of league.teamIds) {
      const held = rostered.get(teamId) ?? [];
      if (held.length <= quota) continue;
      held.sort((a, b) => b.ability - a.ability);
      for (const player of held.slice(quota)) {
        player.teamId = null;
        available.push(player);
      }
      rostered.set(teamId, held.slice(0, quota));
    }

    let need = 0;
    for (const teamId of league.teamIds) need += quota - (rostered.get(teamId)?.length ?? 0);
    if (need <= 0) continue;

    // The league's collective read on each available player: right on average,
    // wrong on any individual.
    const ranked = available
      .map((player) => ({ player, estimate: player.ability + rng.normal(0, SCOUTING_NOISE_SD) }))
      .sort((a, b) => b.estimate - a.estimate);

    let cursor = 0;
    for (const teamId of league.teamIds) {
      const held = rostered.get(teamId) ?? [];
      while (held.length < quota && cursor < ranked.length) {
        const pick = ranked[cursor];
        cursor += 1;
        if (pick === undefined) break;
        pick.player.teamId = teamId;
        held.push(pick.player);
        signed += 1;
      }
    }
  }
  return signed;
}

/** Unsigned players eventually leave the game rather than accumulating forever. */
function pruneUnsigned(league: League): void {
  league.players = league.players.filter(
    (p) => !p.retired && (p.teamId !== null || p.experience <= 3),
  );
}

export interface OffseasonResult {
  readonly summary: OffseasonSummary;
  readonly grades: readonly SeasonGrade[];
  /** Returned rather than left on the league: retired players are pruned from
   *  the population at the end of the offseason, so a caller that wants to
   *  study them has to be handed them here. */
  readonly retired: readonly CareerPlayer[];
}

/**
 * One complete offseason, in the order the real calendar runs it: the season is
 * graded, players develop, some retire, a class declares, and clubs refill.
 *
 * Grading happens before development because a grade describes the season just
 * played, by the player as he was during it.
 */
export function runOffseason(
  league: League,
  rng: Rng,
  context: DevelopmentContext = NEUTRAL_CONTEXT,
  intake: IntakeConfig = OFFSEASON.intake,
): OffseasonResult {
  const active = league.players.filter((p) => !p.retired && p.teamId !== null);
  const grades = gradeSeason(active, rng, league.season);

  const outcomes = developAll(league.players, context, rng);
  const retired = retireAll(league.players, rng, league.season);

  // The class three years out enters the pipeline; every class in it grows.
  const incoming = league.season + intake.pipelineYears;
  if (!league.pipeline.has(incoming)) {
    league.pipeline.set(incoming, generateClass(rng, incoming, intake));
  }
  for (const cls of league.pipeline.values()) developProspects(cls, rng, intake);

  const declaring = league.pipeline.get(league.season) ?? [];
  league.pipeline.delete(league.season);
  for (const prospect of declaring) {
    league.players.push(prospectToPlayer(prospect));
  }

  pruneUnsigned(league);
  const drafted = fillRosters(league, rng);
  league.season += 1;

  return {
    summary: {
      season: league.season - 1,
      retired: retired.length,
      drafted,
      developed: outcomes.length,
      meanAbility: meanRosteredAbility(league),
      meanAge: meanRosteredAge(league),
      breakouts: outcomes.filter((o) => o.breakout).length,
      busts: outcomes.filter((o) => o.bust).length,
    },
    grades,
    retired,
  };
}

/** Seeds the pipeline so the first few seasons have classes to draw on. */
export function primePipeline(
  league: League, rng: Rng, intake: IntakeConfig = OFFSEASON.intake,
): void {
  for (let i = 0; i <= intake.pipelineYears; i += 1) {
    const year = league.season + i;
    if (!league.pipeline.has(year)) league.pipeline.set(year, generateClass(rng, year, intake));
  }
}
