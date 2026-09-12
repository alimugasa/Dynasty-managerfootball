// The coaching carousel: who is fired, who is hired, and who walks away.
//
// A club judges its head coach against what the roster said it should win, not
// against .500. A coach who wins nine with the league's worst roster is doing
// the job; a coach who wins nine with the best is not. That comparison is the
// whole mechanism, and it is why a rebuild can survive a losing season and a
// contender cannot.
//
// Everything here is decided by the engine from the record it is given. A
// caller that has no records -- a population report, a drift run -- gets the
// ageing and the retirements and no firings, because there is no evidence to
// fire anyone on. Nobody is dismissed on a hunch.
//
// New coaches enter the way new players do: a generated intake, sized to
// replace what left, so a fifty-season dynasty never runs out of candidates.

import { clamp } from '../calibration.ts';
import type { Rng } from '../rng.ts';
import { namePalette, type NamePalette } from './draftClass.ts';
import type { CareerCoach, CoachRole, CoachTree } from './coaches.ts';
import { staffOf } from './coaches.ts';
import type { League } from './league.ts';

/** What a club's season was, as the carousel reads it. */
export interface CoachRecord {
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  /** What this roster should have won. */
  readonly expectedWins: number;
  /** True for the club that won the final. */
  readonly champion?: boolean;
  /** True for a club that reached the bracket. */
  readonly madePlayoffs?: boolean;
}

export type CoachMoveKind = 'RETAINED' | 'FIRED' | 'RETIRED' | 'HIRED' | 'PROMOTED';

export interface CoachMove {
  readonly coachId: string;
  readonly name: string;
  readonly kind: CoachMoveKind;
  /** Club he ends the offseason at, or null if he has no job. */
  readonly teamId: string | null;
  readonly role: CoachRole | null;
  /** Club he was at when the season ended. */
  readonly fromTeamId: string | null;
  /** Filled for a firing: the record that ended it. */
  readonly record: string | null;
}

export const CAROUSEL = {
  /** A head coach is safe below this, whatever the record. */
  hotSeatFiring: 74,
  /** Nobody is fired in his first season: one year is not a sample. */
  graceSeasons: 1,
  /** Ceiling on how much of the league turns over in one offseason. */
  maxFiringsShare: 0.25,
  /** Age from which retirement becomes a real possibility. */
  retirementFromAge: 62,
  /** Age by which everyone has gone. */
  retirementByAge: 78,
  /** Seasons out of work before a coach stops waiting for the phone. */
  maxSeasonsUnemployed: 3,
  /** Candidates kept available per club. */
  poolPerClub: 2,
} as const;

/** Where the seat sits after a season, 0-99. Last year's rating carries: a
 *  seat gets hot over two bad years, not in one afternoon. */
export function seatAfter(coach: CareerCoach, record: CoachRecord): number {
  const gap = record.wins + record.ties / 2 - record.expectedWins;
  // Eight points of seat per win short of expectation, cooled by success.
  const move = -gap * 8 + (record.champion === true ? -45 : 0)
    + (record.madePlayoffs === true ? -12 : 0);
  // A long tenure buys patience; a new coach has not earned any yet, which is
  // why the grace period is separate from the rating.
  const patience = Math.min(12, coach.yearsWithTeam * 2);
  return clamp(coach.hotSeat * 0.5 + 40 + move - patience, 0, 99);
}

/** How likely a coach is to walk away this offseason. */
export function retirementChance(coach: CareerCoach): number {
  if (coach.age >= CAROUSEL.retirementByAge) return 1;
  if (coach.age < CAROUSEL.retirementFromAge) {
    // Only the long-term unemployed leave early, and then they are leaving
    // the profession rather than retiring from it.
    return 0;
  }
  const span = CAROUSEL.retirementByAge - CAROUSEL.retirementFromAge;
  const through = (coach.age - CAROUSEL.retirementFromAge) / span;
  return clamp(0.08 + through * 0.6, 0, 1);
}

/** What a club with this roster should win, on the engine's own scale. */
export function expectedWins(rosterRating: number, leagueMean: number, games: number): number {
  // Six rating points is worth about a win and a half, which is the slope the
  // seed's own rosters and records produce over a season.
  return clamp(games / 2 + (rosterRating - leagueMean) * 0.25, games * 0.2, games * 0.8);
}

const ROLE_RANK: Readonly<Record<CoachRole, number>> = {
  HEAD_COACH: 4, OFFENSIVE_COORDINATOR: 3, DEFENSIVE_COORDINATOR: 3,
  SPECIAL_TEAMS: 2, POSITION_COACH: 1,
};

/** What a hiring club sees: what he has done, what he is thought to be, and
 *  whether he has held the chair before. */
function candidateScore(coach: CareerCoach, forRole: CoachRole): number {
  const relevant = forRole === 'HEAD_COACH'
    ? coach.leadership * 0.4 + coach.gameManagement * 0.3 + coach.development * 0.3
    : forRole === 'OFFENSIVE_COORDINATOR' || forRole === 'DEFENSIVE_COORDINATOR'
      ? coach.playCalling * 0.6 + coach.development * 0.4
      : coach.ability;
  const chair = forRole === 'HEAD_COACH' ? Math.min(8, coach.seasonsAsHeadCoach * 2) : 0;
  return relevant * 0.6 + coach.reputation * 0.4 + chair;
}

/** Whether a coach is a plausible candidate for a job at all. */
function eligible(coach: CareerCoach, forRole: CoachRole): boolean {
  if (coach.retired) return false;
  if (forRole === 'HEAD_COACH') {
    return coach.seasonsAsHeadCoach > 0
      || (coach.role !== null && ROLE_RANK[coach.role] >= 3)
      || coach.reputation >= 70;
  }
  if (forRole === 'OFFENSIVE_COORDINATOR') return coach.tree !== 'DEFENSE';
  if (forRole === 'DEFENSIVE_COORDINATOR') return coach.tree !== 'OFFENSE';
  return true;
}

/** A coach who was not there before: the intake that keeps the pool stocked.
 *  Named from the league's own name pools, like a draft class. The index is
 *  passed rather than counted here: a module-level counter would make the same
 *  league generate different ids on a second run in the same process, which is
 *  exactly the kind of hidden state a seeded engine cannot have. */
export function generateCoach(
  rng: Rng, palette: NamePalette, season: number, index: number,
): CareerCoach {
  const first = rng.pick(palette.first);
  const last = rng.pick(palette.last);
  const grade = clamp(rng.normal(56, 11), 28, 92);
  const spread = (): number => clamp(rng.normal(grade, 8), 20, 99);
  const trees: readonly CoachTree[] = ['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS'];
  return {
    id: `CCH${String(season)}${String(index).padStart(4, '0')}`,
    name: `${first} ${last}`,
    teamId: null,
    role: null,
    tree: rng.pick(trees),
    age: rng.int(34, 52),
    experience: rng.int(6, 20),
    yearsWithTeam: 0,
    seasonsAsHeadCoach: 0,
    playCalling: spread(),
    gameManagement: spread(),
    clockManagement: spread(),
    aggressiveness: clamp(rng.normal(50, 14), 10, 90),
    development: spread(),
    evaluation: spread(),
    leadership: spread(),
    ability: grade,
    reputation: grade,
    careerWins: 0, careerLosses: 0, careerTies: 0, rings: 0,
    hotSeat: 30,
    retired: false,
  };
}

export interface CarouselResult {
  readonly moves: readonly CoachMove[];
  /** Clubs whose head coach changed, in the order they hired. */
  readonly vacancies: readonly string[];
}

/**
 * One offseason of coaching moves.
 *
 * Order matters and is the real thing's order: the season is credited, seats
 * are recomputed, coaches retire, clubs fire, then everyone hires from one
 * pool -- so a club that fires late is choosing from what the earlier clubs
 * left. Filling a coordinator's chair from a rival's staff is not modelled;
 * a coordinator hired as a head coach vacates his own seat, and that vacancy
 * is filled in the same pass.
 */
export function runCarousel(
  league: League, records: ReadonlyMap<string, CoachRecord>, rng: Rng,
): CarouselResult {
  const moves: CoachMove[] = [];
  const coaches = league.coaches.filter((c) => !c.retired);
  const recordOf = (teamId: string | null): CoachRecord | undefined =>
    (teamId === null ? undefined : records.get(teamId));

  // 1. The season goes on the record, and the seat is recomputed from it.
  for (const coach of coaches) {
    const record = recordOf(coach.teamId);
    if (record !== undefined) {
      coach.careerWins += record.wins;
      coach.careerLosses += record.losses;
      coach.careerTies += record.ties;
      if (record.champion === true) coach.rings += 1;
      if (coach.role === 'HEAD_COACH') coach.hotSeat = seatAfter(coach, record);
    }
    coach.age += 1;
    coach.experience += 1;
    // Seasons in his current situation: with this club, or out of work.
    coach.yearsWithTeam += 1;
    if (coach.role === 'HEAD_COACH') coach.seasonsAsHeadCoach += 1;
    // Results move standing, slowly and both ways.
    if (record !== undefined && coach.role === 'HEAD_COACH') {
      const gap = record.wins + record.ties / 2 - record.expectedWins;
      coach.ability = clamp(coach.ability + gap * 0.5, 25, 99);
      coach.reputation += (coach.ability - coach.reputation) * 0.35 + gap * 0.4;
      coach.reputation = clamp(coach.reputation, 20, 99);
    }
  }

  // 2. Retirements, and the long-term unemployed leaving the profession.
  for (const coach of coaches) {
    const done = rng.chance(retirementChance(coach))
      || (coach.teamId === null && coach.yearsWithTeam >= CAROUSEL.maxSeasonsUnemployed);
    if (!done) continue;
    moves.push({
      coachId: coach.id, name: coach.name, kind: 'RETIRED',
      teamId: null, role: null, fromTeamId: coach.teamId, record: null,
    });
    coach.retired = true;
    coach.teamId = null;
    coach.role = null;
  }

  // 3. Firings, worst seat first, bounded so a league does not turn over
  //    entirely in one winter.
  const heads = league.coaches.filter((c) => !c.retired && c.role === 'HEAD_COACH');
  const limit = Math.floor(league.teamIds.length * CAROUSEL.maxFiringsShare);
  const atRisk = heads
    .filter((c) => c.hotSeat >= CAROUSEL.hotSeatFiring
      && c.yearsWithTeam > CAROUSEL.graceSeasons
      && recordOf(c.teamId) !== undefined)
    .sort((a, b) => b.hotSeat - a.hotSeat)
    .slice(0, limit);
  const vacancies: string[] = [];
  for (const coach of atRisk) {
    const from = coach.teamId;
    const record = recordOf(from);
    if (from === null || record === undefined) continue;
    moves.push({
      coachId: coach.id, name: coach.name, kind: 'FIRED',
      teamId: null, role: null, fromTeamId: from,
      record: `${String(record.wins)}-${String(record.losses)}${record.ties > 0 ? `-${String(record.ties)}` : ''}`,
    });
    coach.teamId = null;
    coach.role = null;
    coach.yearsWithTeam = 0;
    vacancies.push(from);
  }

  // 4. Hiring. Attractive clubs choose first, from one pool.
  const attractiveness = (teamId: string): number => {
    const record = records.get(teamId);
    const front = league.fronts.get(teamId);
    return (front?.prestige ?? 50) + (record === undefined ? 0 : record.wins * 2);
  };
  const order = [...vacancies].sort((a, b) => attractiveness(b) - attractiveness(a));
  for (const teamId of order) {
    hire(league, teamId, 'HEAD_COACH', moves, 'HIRED');
  }

  // 5. Any seat left empty -- a coordinator promoted away, a retirement, a
  //    club that never had one -- is filled before the season starts. A club
  //    does not open a year without a coach.
  for (const teamId of league.teamIds) {
    for (const role of ['HEAD_COACH', 'OFFENSIVE_COORDINATOR', 'DEFENSIVE_COORDINATOR'] as const) {
      const held = staffOf(league.coaches, teamId).some((c) => c.role === role);
      if (!held) hire(league, teamId, role, moves, 'HIRED');
    }
  }

  // 6. The intake, sized to keep the pool stocked for next winter.
  const free = league.coaches.filter((c) => !c.retired && c.teamId === null).length;
  const target = league.teamIds.length * CAROUSEL.poolPerClub;
  if (free < target) {
    const palette = namePalette(league.players);
    for (let i = free; i < target; i += 1) {
      league.coaches.push(generateCoach(rng, palette, league.season, i));
    }
  }
  league.coaches = league.coaches.filter((c) => !c.retired);

  return { moves, vacancies: order };
}

/** Fills one job from the pool, promoting from inside where the inside is
 *  better. A promotion leaves a seat, which the caller's later pass fills. */
function hire(
  league: League, teamId: string, role: CoachRole, moves: CoachMove[], kind: CoachMoveKind,
): void {
  const pool = league.coaches.filter((c) => !c.retired
    && (c.teamId === null || (c.teamId !== teamId && c.role !== 'HEAD_COACH' && role === 'HEAD_COACH'))
    && eligible(c, role));
  const inside = role === 'HEAD_COACH'
    ? staffOf(league.coaches, teamId).filter((c) => c.role !== 'HEAD_COACH' && eligible(c, role))
    : staffOf(league.coaches, teamId).filter((c) => c.role === 'POSITION_COACH' && eligible(c, role));
  const candidates = [...pool, ...inside];
  if (candidates.length === 0) return;
  const best = candidates.reduce((a, b) =>
    (candidateScore(b, role) > candidateScore(a, role) ? b : a));
  const from = best.teamId;
  const promoted = from === teamId;
  best.teamId = teamId;
  best.role = role;
  best.yearsWithTeam = 0;
  best.hotSeat = role === 'HEAD_COACH' ? 30 : best.hotSeat;
  moves.push({
    coachId: best.id, name: best.name, kind: promoted ? 'PROMOTED' : kind,
    teamId, role, fromTeamId: from, record: null,
  });
}
