// One season, week by week.
//
// The loop the game actually runs: build a schedule, play each week, carry
// absences forward, and hand back the record. It lives in the engine rather
// than in a script because three scripts had each grown their own copy, and a
// season loop that differs between the report harness and the game is a season
// loop whose results cannot be compared.
//
// Pure, like everything else here: no clock, no I/O, no Math.random.

import { createRng, type Rng } from './rng.ts';
import { simulateGame } from './simulateGame.ts';
import { MissingUnitError, POSITION_GROUPS, type PositionGroup, type TeamState }
  from './types.ts';

export interface Fixture {
  readonly week: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
}

export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface SeasonResult {
  readonly season: number;
  readonly records: ReadonlyMap<string, TeamRecord>;
  readonly gamesPlayed: number;
  /** Games no club could field a side for. Reported, never replaced with an
   *  invented scoreline. */
  readonly abandoned: number;
  readonly injuries: number;
  /** Games each player missed through injury. The offseason's injury-driven
   *  decline reads this; without it every player enters development having
   *  played a full season, and injuries have no career consequence. */
  readonly gamesMissed: ReadonlyMap<string, number>;
}

/**
 * A round-robin schedule.
 *
 * The circle method: one club is held fixed and the rest rotate, which produces
 * a schedule where every club plays every week and no club meets the same
 * opponent twice inside a rotation. Home and away alternate by round so the
 * split stays even -- an uneven split would hand half the league a home-field
 * advantage all season and quietly bias every standings assertion.
 */
export function buildSchedule(teamIds: readonly string[], weeks: number): Fixture[] {
  const ids = [...teamIds];
  if (ids.length % 2 === 1) ids.push('__BYE__');
  const half = ids.length / 2;
  const rotating = ids.slice(1);
  const fixtures: Fixture[] = [];

  for (let week = 1; week <= weeks; week += 1) {
    const offset = (week - 1) % rotating.length;
    const order = [ids[0] as string, ...rotating.slice(offset), ...rotating.slice(0, offset)];

    for (let i = 0; i < half; i += 1) {
      const a = order[i];
      const b = order[order.length - 1 - i];
      if (a === undefined || b === undefined) continue;
      if (a === '__BYE__' || b === '__BYE__') continue;
      // Alternating by week keeps each club's home count within one of half.
      const homeFirst = (week + i) % 2 === 0;
      fixtures.push({
        week,
        homeTeamId: homeFirst ? a : b,
        awayTeamId: homeFirst ? b : a,
      });
    }
  }
  return fixtures;
}

/** A club with its unavailable players removed from the depth chart. */
function withoutInjured(team: TeamState, out: ReadonlySet<string>): TeamState {
  if (out.size === 0) return team;
  const depthChart = {} as Record<PositionGroup, string[]>;
  for (const group of POSITION_GROUPS) {
    depthChart[group] = [...(team.depthChart[group] ?? [])].filter((id) => !out.has(id));
  }
  return { ...team, depthChart };
}

const emptyRecord = (): TeamRecord =>
  ({ wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 });

/**
 * Next year's schedule from this year's shape.
 *
 * A league's calendar has a shape -- how many games, where the byes fall, who
 * is home when -- and the seed's is 17 games over 18 weeks with byes in the
 * middle. The circle method above makes 18 games in 18 weeks with no byes,
 * which is a different competition. So a later season keeps the shape and
 * changes the names: every club is mapped to another by a seeded permutation,
 * and the fixtures come out with the same weeks and the same home/away
 * pattern under different opponents. The same seed gives the same calendar.
 */
export function permuteSchedule(
  shape: readonly Fixture[], teamIds: readonly string[], rng: Rng,
): Fixture[] {
  const from = [...new Set(shape.flatMap((f) => [f.homeTeamId, f.awayTeamId]))].sort();
  const to = [...teamIds].sort();
  if (from.length !== to.length) {
    throw new Error(
      `A schedule for ${String(from.length)} teams cannot be reshaped for ${String(to.length)}`);
  }
  // Fisher-Yates over the seeded stream.
  for (let i = to.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    const a = to[i];
    const b = to[j];
    if (a !== undefined && b !== undefined) { to[i] = b; to[j] = a; }
  }
  const map = new Map(from.map((id, i) => [id, to[i] ?? id]));
  return shape.map((f) => ({
    week: f.week,
    homeTeamId: map.get(f.homeTeamId) ?? f.homeTeamId,
    awayTeamId: map.get(f.awayTeamId) ?? f.awayTeamId,
  }));
}

export interface SeasonOptions {
  readonly weeks?: number;
  /** Called with each finished game, for a caller that wants to persist them.
   *  The loop itself keeps only the record. */
  readonly onGame?: (fixture: Fixture, home: number, away: number) => void;
}

/**
 * Plays a season.
 *
 * Absences carry across weeks, which the game engine itself does not do -- a
 * game is independent, and persisting an absence is the season's job. Without
 * it every club fields its best eleven every week and "injuries" means nothing.
 */
export function simulateSeason(
  season: number,
  teams: ReadonlyMap<string, TeamState>,
  seed: number,
  options: SeasonOptions = {},
): SeasonResult {
  const weeks = options.weeks ?? 17;
  const teamIds = [...teams.keys()];
  const schedule = buildSchedule(teamIds, weeks);
  const rng: Rng = createRng(seed);

  const records = new Map<string, TeamRecord>();
  for (const id of teamIds) records.set(id, emptyRecord());

  const absence = new Map<string, number>();
  const gamesMissed = new Map<string, number>();
  let gamesPlayed = 0;
  let abandoned = 0;
  let injuries = 0;

  for (let week = 1; week <= weeks; week += 1) {
    const out = new Set(absence.keys());
    for (const playerId of out) {
      gamesMissed.set(playerId, (gamesMissed.get(playerId) ?? 0) + 1);
    }

    for (const fixture of schedule.filter((f) => f.week === week)) {
      const home = teams.get(fixture.homeTeamId);
      const away = teams.get(fixture.awayTeamId);
      if (home === undefined || away === undefined) continue;

      let game;
      try {
        game = simulateGame(
          withoutInjured(home, out), withoutInjured(away, out), rng, { allowTie: true });
      } catch (error) {
        // A club with no fieldable quarterback or offensive line cannot play.
        if (error instanceof MissingUnitError) { abandoned += 1; continue; }
        throw error;
      }

      gamesPlayed += 1;
      options.onGame?.(fixture, game.homeScore, game.awayScore);

      const homeRecord = records.get(home.id);
      const awayRecord = records.get(away.id);
      if (homeRecord !== undefined && awayRecord !== undefined) {
        homeRecord.pointsFor += game.homeScore;
        homeRecord.pointsAgainst += game.awayScore;
        awayRecord.pointsFor += game.awayScore;
        awayRecord.pointsAgainst += game.homeScore;
        if (game.homeScore === game.awayScore) {
          homeRecord.ties += 1;
          awayRecord.ties += 1;
        } else if (game.homeScore > game.awayScore) {
          homeRecord.wins += 1;
          awayRecord.losses += 1;
        } else {
          awayRecord.wins += 1;
          homeRecord.losses += 1;
        }
      }

      for (const injury of game.injuries) {
        injuries += 1;
        if (injury.returnsThisGame) continue;
        const weeksOut = injury.severity === 'seasonEnding'
          ? weeks - week + 1
          : Math.max(1, injury.weeksOut);
        const current = absence.get(injury.playerId) ?? 0;
        if (weeksOut > current) absence.set(injury.playerId, weeksOut);
      }
    }

    for (const [playerId, remaining] of absence) {
      if (remaining <= 1) absence.delete(playerId);
      else absence.set(playerId, remaining - 1);
    }
  }

  return { season, records, gamesPlayed, abandoned, injuries, gamesMissed };
}
