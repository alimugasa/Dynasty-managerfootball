// Career state -> the state a game is played from.
//
// The offseason engine holds a player as one ability number plus the things
// that move it. The game engine wants a squad with a depth chart. This is the
// join, and it is the piece that lets a save be simulated forward rather than
// only developed forward.
//
// What it deliberately does NOT do is invent per-skill ratings. PlayerRatings
// has sixteen optional skills, and the career model knows none of them: it has
// `ability`, and that is the truth it holds. roster.ts already reads a skill as
// `ratings[skill] ?? ratings.overall`, so a player carrying only `overall` is
// rated on his actual ability at every skill, which is exactly right for a
// model that does not distinguish them. Synthesising a spread from a hash of
// the player id would look more detailed and would be fabrication -- it would
// decide, from nothing, that this quarterback is accurate but indecisive, and
// the game would then be won and lost on it.
//
// When the career model grows real per-skill attributes, they arrive here.

import type { CareerPlayer } from './offseason/types.ts';
import type { TeamFront } from './offseason/frontOffice.ts';
import {
  coachingStateFor, LEAGUE_AVERAGE_RATING, type CareerCoach,
} from './offseason/coaches.ts';
import { POSITION_GROUPS, type EnginePlayer, type PositionGroup, type TeamState }
  from './types.ts';

/** Ordering within a group. Ability plus experience, which is what a coach
 *  actually starts: a rookie does not displace a competent veteran on ability
 *  alone. Matches how rosterValue weighs the same two things in the offseason. */
function depthScore(p: CareerPlayer): number {
  return p.ability + p.mental * 0.35;
}

function toEnginePlayer(p: CareerPlayer): EnginePlayer {
  return {
    id: p.id,
    name: p.name,
    group: p.group,
    ratings: { overall: p.ability + p.mental * 0.25 },
    durability: p.durability,
    // The career model has no separate stamina attribute. Work ethic is the
    // nearest thing it holds and is what conditioning would be built from, so
    // it stands in -- named here rather than hidden, because it is a stand-in.
    stamina: p.workEthic,
  };
}

export interface BridgeOptions {
  /** Front offices. Kept for the clubs a caller builds by hand; the coaching
   *  a club gets comes from its staff where one is passed. */
  readonly fronts?: ReadonlyMap<string, TeamFront>;
  /** The league's coaches. A club with no staff gets league-average coaching
   *  rather than an exception: a missing staff should not stop a game. */
  readonly coaches?: readonly CareerCoach[];
}

/**
 * One club, ready to play.
 *
 * Retired players are excluded here rather than assumed absent. They are pruned
 * from the population at the end of the offseason, but a save loaded mid-cycle
 * can hold them, and a retired player left in a depth chart would be selected
 * to play.
 */
export function teamStateFor(
  teamId: string, players: readonly CareerPlayer[], options: BridgeOptions = {},
): TeamState {
  const squad = players.filter((p) => p.teamId === teamId && !p.retired);
  const ranked = [...squad].sort((a, b) => depthScore(b) - depthScore(a));

  const depthChart = {} as Record<PositionGroup, string[]>;
  for (const group of POSITION_GROUPS) {
    depthChart[group] = ranked.filter((p) => p.group === group).map((p) => p.id);
  }

  // Who calls the plays and manages the clock. Before staffs existed this was
  // the front office standing in for a coach; now it is the coach, and the
  // stand-in is what a club without one falls back to.
  const front = options.fronts?.get(teamId);
  const standIn = front === undefined
    ? LEAGUE_AVERAGE_RATING : (front.scouting + front.prestige) / 2;
  const staffed = options.coaches !== undefined
    && options.coaches.some((c) => !c.retired && c.teamId === teamId);
  const coaching = staffed
    ? coachingStateFor(options.coaches ?? [], teamId)
    : {
      playCalling: standIn, gameManagement: standIn,
      clockManagement: standIn, aggressiveness: 50,
    };

  return {
    id: teamId,
    abbreviation: teamId,
    players: ranked.map(toEnginePlayer),
    depthChart,
    scheme: {
      runPassBalance: 0.445,
      blitzRate: 0.26,
      fourthDownAggression: 50,
      tempo: 50,
    },
    coaching,
  };
}

/** Every club in the league, indexed by id. */
export function teamStatesFor(
  teamIds: readonly string[], players: readonly CareerPlayer[], options: BridgeOptions = {},
): Map<string, TeamState> {
  const out = new Map<string, TeamState>();
  for (const teamId of teamIds) out.set(teamId, teamStateFor(teamId, players, options));
  return out;
}
