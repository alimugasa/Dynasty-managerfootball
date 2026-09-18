// The staff a club employs, as people with careers.
//
// A coach is not a rating attached to a club. He has a name, an age, a record,
// a tree he came up in, and a job he can lose; he arrives from somewhere and
// goes somewhere. That is what makes a carousel worth watching and what makes
// "the club that developed him" a real answer rather than a number.
//
// Three things a staff decides, all of them already inputs the engine reads:
//
//   play-calling      what the offence does on third and four (playcall.ts)
//   game management   the clock, the fourth-down call
//   development       how fast this club's young players close on their
//                     potential (development.ts DevelopmentContext.coaching)
//
// The development multiplier is centred on the league's own mean rather than on
// a fixed constant, so a league of good staffs does not inflate every player and
// a league of poor ones does not sink them. Coaching redistributes development
// between clubs; it does not create or destroy it. That property is what keeps
// the forty-season talent-drift check flat with staffs switched on.

import { clamp } from '../calibration.ts';
import type { CoachingState } from '../types.ts';
import type { DevelopmentContext } from './development.ts';
import type { CareerPlayer } from './types.ts';

/** The jobs the engine models. Everything else on a staff is a position coach:
 *  real people with careers, and the pool coordinators are hired from. */
export const COACH_ROLES = [
  'HEAD_COACH', 'OFFENSIVE_COORDINATOR', 'DEFENSIVE_COORDINATOR',
  'SPECIAL_TEAMS', 'POSITION_COACH',
] as const;
export type CoachRole = (typeof COACH_ROLES)[number];

export const ROLE_LABEL: Readonly<Record<CoachRole, string>> = {
  HEAD_COACH: 'Head coach',
  OFFENSIVE_COORDINATOR: 'Offensive coordinator',
  DEFENSIVE_COORDINATOR: 'Defensive coordinator',
  SPECIAL_TEAMS: 'Special teams coordinator',
  POSITION_COACH: 'Position coach',
};

/** Which side of the ball a coach came up on. Sets who he is a candidate for. */
export const COACH_TREES = ['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS', 'FRONT_OFFICE'] as const;
export type CoachTree = (typeof COACH_TREES)[number];

export interface CareerCoach {
  readonly id: string;
  readonly name: string;
  /** Club employing him, or null while he is out of work. */
  teamId: string | null;
  /** Null only while unemployed: a coach with a club always has a job. */
  role: CoachRole | null;
  readonly tree: CoachTree;
  age: number;
  /** Seasons coaching anywhere. */
  experience: number;
  /** Seasons in this job at this club. */
  yearsWithTeam: number;
  /** Seasons as a head coach, which is what a hiring club reads first. */
  seasonsAsHeadCoach: number;

  // Attributes, 0-99, fixed for a career.
  readonly playCalling: number;
  readonly gameManagement: number;
  readonly clockManagement: number;
  readonly aggressiveness: number;
  readonly development: number;
  readonly evaluation: number;
  readonly leadership: number;

  /** Overall standing, 0-99. Moves with results. */
  ability: number;
  /** What clubs believe he is, which lags what he has done. */
  reputation: number;

  careerWins: number;
  careerLosses: number;
  careerTies: number;
  rings: number;
  /** 0-99. How close he is to being fired. Set by the season just played. */
  hotSeat: number;
  retired: boolean;
}

export const employed = (coaches: readonly CareerCoach[]): CareerCoach[] =>
  coaches.filter((c) => !c.retired && c.teamId !== null);

export const unemployed = (coaches: readonly CareerCoach[]): CareerCoach[] =>
  coaches.filter((c) => !c.retired && c.teamId === null);

export function staffOf(coaches: readonly CareerCoach[], teamId: string): CareerCoach[] {
  return coaches.filter((c) => !c.retired && c.teamId === teamId);
}

export function coachInRole(
  coaches: readonly CareerCoach[], teamId: string, role: CoachRole,
): CareerCoach | undefined {
  return coaches.find((c) => !c.retired && c.teamId === teamId && c.role === role);
}

export const headCoachOf = (coaches: readonly CareerCoach[], teamId: string): CareerCoach | undefined =>
  coachInRole(coaches, teamId, 'HEAD_COACH');

/** The staff's own overall: the head coach, weighted, plus his coordinators. */
export function staffRating(coaches: readonly CareerCoach[], teamId: string): number {
  const head = headCoachOf(coaches, teamId);
  const offense = coachInRole(coaches, teamId, 'OFFENSIVE_COORDINATOR');
  const defense = coachInRole(coaches, teamId, 'DEFENSIVE_COORDINATOR');
  const parts: { value: number; weight: number }[] = [];
  if (head !== undefined) parts.push({ value: head.ability, weight: 2 });
  if (offense !== undefined) parts.push({ value: offense.ability, weight: 1 });
  if (defense !== undefined) parts.push({ value: defense.ability, weight: 1 });
  if (parts.length === 0) return LEAGUE_AVERAGE_RATING;
  const weight = parts.reduce((a, p) => a + p.weight, 0);
  return parts.reduce((a, p) => a + p.value * p.weight, 0) / weight;
}

/** What a club with no staff at all is treated as. Named rather than a bare
 *  literal: a club without coaches is a defect, and this is what the engine
 *  does while one exists rather than a rating anybody earned. */
export const LEAGUE_AVERAGE_RATING = 55;

/**
 * What the game engine reads on a Sunday.
 *
 * The play-caller calls the plays: the offensive coordinator where there is
 * one, the head coach where there is not, which is the same rule the seed's
 * play-calling duty encodes. Game and clock management are the head coach's,
 * because they are decisions he makes; aggressiveness is his too.
 */
export function coachingStateFor(
  coaches: readonly CareerCoach[], teamId: string,
): CoachingState {
  const head = headCoachOf(coaches, teamId);
  const caller = coachInRole(coaches, teamId, 'OFFENSIVE_COORDINATOR') ?? head;
  return {
    playCalling: caller?.playCalling ?? LEAGUE_AVERAGE_RATING,
    gameManagement: head?.gameManagement ?? LEAGUE_AVERAGE_RATING,
    clockManagement: head?.clockManagement ?? LEAGUE_AVERAGE_RATING,
    aggressiveness: head?.aggressiveness ?? 50,
  };
}

/** How much of a staff's development rating is the head coach's. The rest is
 *  the people who actually run the position rooms. */
const HEAD_COACH_SHARE = 0.4;

/** A club's development rating: its head coach, then everyone else on staff. */
export function developmentRating(coaches: readonly CareerCoach[], teamId: string): number {
  const staff = staffOf(coaches, teamId);
  if (staff.length === 0) return LEAGUE_AVERAGE_RATING;
  const head = staff.find((c) => c.role === 'HEAD_COACH');
  const rest = staff.filter((c) => c.role !== 'HEAD_COACH');
  if (head === undefined || rest.length === 0) {
    return staff.reduce((a, c) => a + c.development, 0) / staff.length;
  }
  const room = rest.reduce((a, c) => a + c.development, 0) / rest.length;
  return head.development * HEAD_COACH_SHARE + room * (1 - HEAD_COACH_SHARE);
}

/** How far a staff can move a player's growth, either way. */
export const DEVELOPMENT_SPREAD = 0.3;
/** Rating points from the mean that map to the full spread. */
const RATING_SCALE = 12;

/**
 * The development multiplier per club, centred on the league.
 *
 * Deliberately relative: the mean multiplier over clubs is 1 by construction,
 * so switching staffs on redistributes development without moving the league's
 * talent. An absolute mapping would have made every club's players grow faster
 * the moment the seed's above-average staffs were read.
 */
export function developmentContext(
  coaches: readonly CareerCoach[], teamIds: readonly string[],
  playingTime: DevelopmentContext['playingTime'] = () => 1,
): DevelopmentContext {
  const ratings = new Map(teamIds.map((id) => [id, developmentRating(coaches, id)]));
  const values = [...ratings.values()];
  const mean = values.length === 0
    ? LEAGUE_AVERAGE_RATING : values.reduce((a, v) => a + v, 0) / values.length;
  const multipliers = new Map<string, number>();
  for (const [teamId, rating] of ratings) {
    multipliers.set(teamId, clamp(
      1 + ((rating - mean) / RATING_SCALE) * DEVELOPMENT_SPREAD,
      1 - DEVELOPMENT_SPREAD, 1 + DEVELOPMENT_SPREAD));
  }
  return {
    playingTime,
    coaching: (teamId) => (teamId === null ? 1 : multipliers.get(teamId) ?? 1),
  };
}

/** How well this club reads a prospect: its head coach and whoever evaluates
 *  talent best on the staff, which is the scouting director where one exists. */
export function evaluationRating(coaches: readonly CareerCoach[], teamId: string): number {
  const staff = staffOf(coaches, teamId);
  if (staff.length === 0) return LEAGUE_AVERAGE_RATING;
  const best = Math.max(...staff.map((c) => c.evaluation));
  const head = staff.find((c) => c.role === 'HEAD_COACH');
  return head === undefined ? best : (best + head.evaluation) / 2;
}

/** Playing time as the development context wants it: a starter develops faster
 *  than a healthy scratch. Rank within the position group, not snaps, because
 *  the offseason has no snap counts to read. */
export function playingTimeFrom(
  players: readonly CareerPlayer[], starters: Readonly<Record<string, number>>,
): DevelopmentContext['playingTime'] {
  const rank = new Map<string, number>();
  const byTeamGroup = new Map<string, CareerPlayer[]>();
  for (const p of players) {
    if (p.retired || p.teamId === null) continue;
    const key = `${p.teamId}:${p.group}`;
    byTeamGroup.set(key, [...(byTeamGroup.get(key) ?? []), p]);
  }
  for (const [, group] of byTeamGroup) {
    [...group].sort((a, b) => b.ability + b.mental - (a.ability + a.mental))
      .forEach((p, i) => rank.set(p.id, i));
  }
  return (player) => {
    const place = rank.get(player.id);
    if (place === undefined) return 0.35;
    const slots = starters[player.group] ?? 1;
    if (place < slots) return 1;
    return place < slots * 2 ? 0.6 : 0.35;
  };
}
