// The end of the year: who was best, and who says so.
//
// An award is a vote, not a maximum. Voters read a season the way people do --
// the grade a player earned, what the position is worth, what his club did,
// and the numbers that made the highlight reels -- and they disagree, which is
// why a ballot is kept and why the vote share is part of the result. A league
// that simply hands the trophy to the highest grade has no arguments in it and
// no reason to remember 2034.
//
// Original honours only: this league's own awards, with its own names. See
// docs/IP-POLICY.md.
//
// Pure. Takes what a season was, returns who won it.

import { clamp } from '../calibration.ts';
import type { Rng } from '../rng.ts';
import { POSITION_GROUPS, STARTERS, type PositionGroup } from '../types.ts';
import { POSITION_VALUE } from './needs.ts';

export const AWARD_CODES = [
  'PLAYER_OF_THE_YEAR', 'OFFENSIVE_PLAYER', 'DEFENSIVE_PLAYER',
  'NEWCOMER', 'COACH_OF_THE_YEAR',
] as const;
export type AwardCode = (typeof AWARD_CODES)[number];

export const AWARD_NAME: Readonly<Record<AwardCode, string>> = {
  PLAYER_OF_THE_YEAR: 'Player of the Year',
  OFFENSIVE_PLAYER: 'Offensive Player of the Year',
  DEFENSIVE_PLAYER: 'Defensive Player of the Year',
  NEWCOMER: 'Newcomer of the Year',
  COACH_OF_THE_YEAR: 'Coach of the Year',
};

/** Which side of the ball a group plays on. The kicker and the punter are on
 *  neither, which is why neither award reaches them. */
const OFFENSE: readonly PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'OL'];
const DEFENSE: readonly PositionGroup[] = ['EDGE', 'DT', 'LB', 'CB', 'S'];

/** One player's season, as a voter sees it. */
export interface AwardCandidate {
  readonly playerId: string;
  readonly name: string;
  readonly teamId: string;
  readonly group: PositionGroup;
  /** 0-99.9, the season's grade. */
  readonly grade: number;
  /** Standardised grade: how far above the position's own field he was. */
  readonly gradeZ: number;
  /** Seasons played before this one. Zero is a rookie. */
  readonly experience: number;
  /** Games he was actually on the field for. */
  readonly games: number;
  /** Wins his club had, which is what carries a candidate in a close vote. */
  readonly teamWins: number;
  /** Production, where the position has any. Yards and counting numbers. */
  readonly passYards: number;
  readonly rushYards: number;
  readonly recYards: number;
  readonly touchdowns: number;
  readonly sacks: number;
  readonly interceptions: number;
  readonly tackles: number;
}

export interface CoachCandidate {
  readonly coachId: string;
  readonly name: string;
  readonly teamId: string;
  readonly wins: number;
  readonly losses: number;
  readonly expectedWins: number;
}

export interface Ballot {
  readonly rank: number;
  readonly playerId: string | null;
  readonly coachId: string | null;
  readonly name: string;
  readonly teamId: string;
  /** Share of the vote, 0-1. The winner's share is the first entry's. */
  readonly voteShare: number;
}

export interface Award {
  readonly code: AwardCode;
  readonly name: string;
  readonly winner: Ballot;
  /** The whole ballot, winner first. */
  readonly ballot: readonly Ballot[];
}

export type HonourTeam = 'ALL_LEAGUE_FIRST' | 'ALL_LEAGUE_SECOND';

export interface Honour {
  readonly team: HonourTeam;
  readonly group: PositionGroup;
  readonly slot: number;
  readonly playerId: string;
  readonly name: string;
  readonly teamId: string;
}

export interface AwardResult {
  readonly season: number;
  readonly awards: readonly Award[];
  readonly honours: readonly Honour[];
}

/** How many of a group make an all-league team. The starting shape, so the
 *  team that gets picked could take the field. */
const HONOUR_SLOTS: Readonly<Record<PositionGroup, number>> = STARTERS;

/** Ballot depth. Five is what a voter names and what the ballot table keeps. */
export const BALLOT_DEPTH = 5;

/** Yards and counting numbers, on one scale. Deliberately blunt: this is how
 *  much a voter is swayed by the box score, not a model of value. */
function production(c: AwardCandidate): number {
  return c.passYards / 4000 + c.rushYards / 1500 + c.recYards / 1400
    + c.touchdowns / 12 + c.sacks / 12 + c.interceptions / 6 + c.tackles / 120;
}

/**
 * What a voter thinks of a season.
 *
 * The grade carries it -- that is the season he actually had -- and the
 * position weight is what stops a punter with a huge grade winning anything,
 * because voters do not think a punter can be the best player in the league.
 * Club success is a real thumb on the scale, and so is availability: a player
 * who missed half the year does not win.
 */
export function voterScore(c: AwardCandidate, games: number): number {
  const availability = clamp(c.games / Math.max(1, games), 0, 1);
  const weight = 0.45 + POSITION_VALUE[c.group] * 0.55;
  return (c.grade * 0.6 + c.gradeZ * 6 + production(c) * 9)
    * weight
    * (0.7 + 0.3 * availability)
    + c.teamWins * 0.8;
}

/**
 * Voters disagree, proportionally.
 *
 * The jitter is a share of the season being judged rather than a fixed number
 * of points, because a fixed spread wide enough to make a photo finish
 * unpredictable is also wide enough that, drawn once for each of fifty
 * candidates, somebody ordinary out-draws the best season in the league. A
 * four per cent swing settles a close vote and never overturns a landslide.
 */
const VOTER_SPREAD = 0.04;

function ballotOf(
  scored: readonly { readonly candidate: AwardCandidate; readonly score: number }[],
): Ballot[] {
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, BALLOT_DEPTH);
  // Vote share from the scores themselves: the gap between first and second is
  // what a share is for, and a fixed ladder would say the same thing about a
  // landslide and a photo finish.
  const floor = Math.min(...top.map((t) => t.score));
  const weights = top.map((t) => Math.max(0.0001, t.score - floor * 0.92));
  const total = weights.reduce((a, b) => a + b, 0);
  return top.map((t, i) => ({
    rank: i + 1,
    playerId: t.candidate.playerId,
    coachId: null,
    name: t.candidate.name,
    teamId: t.candidate.teamId,
    voteShare: Math.round(((weights[i] ?? 0) / total) * 1000) / 1000,
  }));
}

function vote(
  code: AwardCode, candidates: readonly AwardCandidate[], games: number, rng: Rng,
): Award | null {
  if (candidates.length === 0) return null;
  const scored = candidates.map((candidate) => ({
    candidate,
    score: voterScore(candidate, games) * (1 + rng.normal(0, VOTER_SPREAD)),
  }));
  const ballot = ballotOf(scored);
  const winner = ballot[0];
  if (winner === undefined) return null;
  return { code, name: AWARD_NAME[code], winner, ballot };
}

/** The coach who did most with what he had. Wins alone would hand it to the
 *  best roster every year, which is not what the award is for. */
function voteCoach(candidates: readonly CoachCandidate[], rng: Rng): Award | null {
  if (candidates.length === 0) return null;
  const scored = candidates.map((c) => ({
    c,
    score: (c.wins - c.expectedWins) * 10 + c.wins * 1.5 + rng.normal(0, 5),
  })).sort((a, b) => b.score - a.score).slice(0, BALLOT_DEPTH);
  const floor = Math.min(...scored.map((s) => s.score));
  const weights = scored.map((s) => Math.max(0.0001, s.score - floor + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const ballot: Ballot[] = scored.map((s, i) => ({
    rank: i + 1, playerId: null, coachId: s.c.coachId, name: s.c.name,
    teamId: s.c.teamId, voteShare: Math.round(((weights[i] ?? 0) / total) * 1000) / 1000,
  }));
  const winner = ballot[0];
  if (winner === undefined) return null;
  return {
    code: 'COACH_OF_THE_YEAR', name: AWARD_NAME.COACH_OF_THE_YEAR, winner, ballot,
  };
}

/** The two all-league teams: the best at each position, then the next best. */
export function selectHonours(
  candidates: readonly AwardCandidate[], games: number,
): Honour[] {
  const out: Honour[] = [];
  for (const group of POSITION_GROUPS) {
    const slots = HONOUR_SLOTS[group];
    if (slots === 0) continue;
    const ranked = candidates
      .filter((c) => c.group === group && c.games >= games / 2)
      .sort((a, b) => voterScore(b, games) - voterScore(a, games));
    for (let i = 0; i < slots * 2; i += 1) {
      const player = ranked[i];
      if (player === undefined) break;
      out.push({
        team: i < slots ? 'ALL_LEAGUE_FIRST' : 'ALL_LEAGUE_SECOND',
        group,
        slot: (i % slots) + 1,
        playerId: player.playerId,
        name: player.name,
        teamId: player.teamId,
      });
    }
  }
  return out;
}

/**
 * Every award and both all-league teams, from one season's evidence.
 *
 * The order the votes are taken in is fixed, so the same season with the same
 * seed produces the same ballots. Each award draws its own voter noise: a
 * player can win the offensive award and lose the overall one, which is what
 * separate votes mean.
 */
export function runAwards(
  season: number,
  candidates: readonly AwardCandidate[],
  coaches: readonly CoachCandidate[],
  games: number,
  rng: Rng,
): AwardResult {
  const eligible = candidates.filter((c) => c.games > 0);
  const awards: Award[] = [];
  const add = (award: Award | null): void => { if (award !== null) awards.push(award); };

  add(vote('PLAYER_OF_THE_YEAR', eligible.filter((c) => c.group !== 'K' && c.group !== 'P' && c.group !== 'LS'), games, rng));
  add(vote('OFFENSIVE_PLAYER', eligible.filter((c) => OFFENSE.includes(c.group)), games, rng));
  add(vote('DEFENSIVE_PLAYER', eligible.filter((c) => DEFENSE.includes(c.group)), games, rng));
  add(vote('NEWCOMER', eligible.filter((c) => c.experience === 0), games, rng));
  add(voteCoach(coaches, rng));

  return { season, awards, honours: selectHonours(eligible, games) };
}
