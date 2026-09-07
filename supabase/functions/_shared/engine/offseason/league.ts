// League shape and roster accounting. Depended on by the draft, free agency and
// the offseason orchestration alike, so it holds no logic that depends on them.

import { POSITION_GROUPS, type PositionGroup } from '../types.ts';
import type { TeamFront } from './frontOffice.ts';
import type { CareerPlayer, Prospect } from './types.ts';

/** Roster shape, 53 players. Fixed so supply and demand stay aligned and a club
 *  cannot answer a shortage at one position by carrying eleven of another. */
export const ROSTER_QUOTA: Readonly<Record<PositionGroup, number>> = {
  QB: 3, RB: 4, WR: 7, TE: 3, OL: 10,
  EDGE: 4, DT: 4, LB: 6, CB: 6, S: 4, K: 1, P: 1,
};

export const ROSTER_SIZE = POSITION_GROUPS.reduce((n, g) => n + ROSTER_QUOTA[g], 0);

/**
 * What a club may carry between seasons, before the cut to the season-opening
 * roster.
 *
 * Without this the draft and the market cannot function: seven picks land on a
 * roster already at its limit, every club is instantly full, and no club bids on
 * anyone. Real clubs carry ninety through the offseason for exactly this reason
 * and cut to the limit before week one.
 */
export const OFFSEASON_QUOTA: Readonly<Record<PositionGroup, number>> = {
  QB: 5, RB: 7, WR: 11, TE: 5, OL: 16,
  EDGE: 7, DT: 7, LB: 10, CB: 10, S: 7, K: 2, P: 2,
};

export const OFFSEASON_ROSTER_LIMIT =
  POSITION_GROUPS.reduce((n, g) => n + OFFSEASON_QUOTA[g], 0);

export interface League {
  readonly teamIds: readonly string[];
  /** Front-office state per club, keyed by team id. */
  readonly fronts: Map<string, TeamFront>;
  /** Every player still in the game, rostered or not. */
  players: CareerPlayer[];
  /** Classes not yet drafted, keyed by their draft year. */
  pipeline: Map<number, Prospect[]>;
  /** Money still owed to released players, by club. */
  deadMoney: Map<string, number>;
  season: number;
}

/**
 * What a player is worth to a roster, as opposed to what he can do today.
 *
 * Current ability plus a share of his remaining upside, weighted by how much
 * career is left to realise it. Ranking cuts on present ability alone releases
 * young players with room to grow ahead of older players without it -- which
 * cost first-round picks their place in the same offseason they were drafted,
 * something no club does.
 */
export function rosterValue(player: CareerPlayer): number {
  const upside = Math.max(0, player.potential - player.ability);
  const youth = Math.max(0, Math.min(1, (28 - player.age) / 8));
  return player.ability + player.mental + upside * youth * 0.5;
}

export function rosterOf(league: League, teamId: string): CareerPlayer[] {
  return league.players.filter((p) => !p.retired && p.teamId === teamId);
}

export function rosteredPlayers(league: League): CareerPlayer[] {
  return league.players.filter((p) => !p.retired && p.teamId !== null);
}

export function freeAgents(league: League): CareerPlayer[] {
  return league.players.filter((p) => !p.retired && p.teamId === null);
}

/** Mean ability of rostered players: the number that must stay flat. */
export function meanRosteredAbility(league: League): number {
  const rostered = rosteredPlayers(league);
  if (rostered.length === 0) return NaN;
  return rostered.reduce((a, p) => a + p.ability, 0) / rostered.length;
}

export function meanRosteredAge(league: League): number {
  const rostered = rosteredPlayers(league);
  if (rostered.length === 0) return NaN;
  return rostered.reduce((a, p) => a + p.age, 0) / rostered.length;
}

/** Turns a drafted or signed prospect into a player with a career. */
export function prospectToPlayer(prospect: Prospect): CareerPlayer {
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
    personality: prospect.personality,
    contract: null,
    previousTeamId: null,
  };
}
