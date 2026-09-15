// The preseason: three games that count for nothing and decide everything.
//
// Played through the same engine as any other game and booked completely
// differently. The rule the whole phase turns on is that August touches the
// roster and nothing else:
//
//   * results are written under competition PRESEASON, so no standings row is
//     recomputed, no career record moves, and nothing seeds a bracket;
//   * totals roll up under PRESEASON too, and rollUpSeasonStats groups by that
//     column -- so leader boards, career totals and league records exclude
//     August by construction rather than by every query remembering to;
//   * injuries, fatigue and development are real, because those are the things
//     a preseason is actually for.
//
// The fourth thing it produces is the evaluation: what the staff learned. That
// lives in camp_evaluations and is the input to every roster decision the
// manager makes for the rest of the month.

import type { Db } from './db.ts';
import { badRequest } from './context.ts';
import { rngSeed32, gameStream, type SaveRow } from './save.ts';
import { loadEngineState } from './saveStore.ts';
import { readDepthChart } from './project/index.ts';
import { absentPlayers, rollUpSeasonStats, upsertInjuries } from './project/stats.ts';
import { playFixtures } from './week.ts';
import { teamStatesFor } from '../engine/careerBridge.ts';
import { createRng } from '../engine/rng.ts';
import { ENGINE_DATA_CLASS } from './project/players.ts';
import { PRESEASON_WEEKS } from './preseason.ts';
import { gradePreseason, writeEvaluations } from './campEvaluation.ts';
import type { PositionGroup, TeamState } from '../engine/types.ts';

interface FixtureRow {
  game_id: string; home_team_id: string; away_team_id: string; neutral_site: boolean;
}

export interface PreseasonOutcome {
  readonly season: number;
  /** The preseason week just played, 1-based. */
  readonly week: number;
  /** How many of the three are left after this one. */
  readonly remaining: number;
  readonly played: number;
  readonly abandoned: readonly string[];
  /** The user club's own result, or null on a bye. */
  readonly ourScore: number | null;
  readonly theirScore: number | null;
}

/**
 * Three rounds of fixtures, drawn before camp breaks.
 *
 * Every club plays every round, paired against the club that sits the same
 * distance down a rotated list -- which is enough to give thirty-two clubs
 * three different opponents without pretending the preseason has a structure.
 * It does not: a real preseason schedule is a set of handshakes between clubs,
 * and modelling it as anything more would be inventing a rule nobody plays by.
 */
export function preseasonPairings(
  teamIds: readonly string[], round: number,
): readonly { home: string; away: string }[] {
  const ids = [...teamIds].sort();
  const half = Math.floor(ids.length / 2);
  const pairs: { home: string; away: string }[] = [];
  for (let i = 0; i < half; i += 1) {
    const a = ids[i];
    // Rotated by the round, so the three rounds are three different draws.
    const b = ids[half + ((i + round - 1) % half)];
    if (a === undefined || b === undefined) continue;
    // Home swaps with the round, so no club plays all three away.
    pairs.push(round % 2 === 1 ? { home: a, away: b } : { home: b, away: a });
  }
  return pairs;
}

/** Writes the three rounds. Idempotent: a save that already has them is left
 *  alone rather than given six. */
export async function writePreseasonSchedule(
  db: Db, saveId: string, season: number, teamIds: readonly string[],
): Promise<number> {
  const [existing] = await db<{ n: string }[]>`
    select count(*)::text as n from public.season_schedule
     where save_id = ${saveId} and season = ${season} and competition = 'PRESEASON'`;
  if (Number(existing?.n ?? 0) > 0) return 0;

  let written = 0;
  for (let round = 1; round <= PRESEASON_WEEKS; round += 1) {
    const pairs = preseasonPairings(teamIds, round);
    if (pairs.length === 0) continue;
    const ids = pairs.map((_, i) =>
      `P${String(season)}W${String(round)}${String(i + 1).padStart(3, '0')}`);
    await db`
      insert into public.season_schedule (
        save_id, game_id, season, week, competition, playoff_round,
        home_team_id, away_team_id, neutral_site, status, data_class)
      select ${saveId}, u.game_id, ${season}, ${round}, 'PRESEASON', null,
             u.home, u.away, false, 'SCHEDULED', ${ENGINE_DATA_CLASS}
        from unnest(${ids}::text[], ${pairs.map((p) => p.home)}::text[],
                    ${pairs.map((p) => p.away)}::text[])
          as u(game_id, home, away)`;
    written += pairs.length;
  }
  return written;
}

/**
 * Plays one preseason round.
 *
 * Deliberately not playWeek(): that function's whole second half is standings,
 * seeding, the bracket and the league's news, none of which August has any
 * business touching. What they share is the part that plays football, which is
 * imported rather than copied.
 */
export async function playPreseasonWeek(db: Db, save: SaveRow): Promise<PreseasonOutcome> {
  const { id: saveId, season, week } = save;
  if (save.phase !== 'PRESEASON') {
    throw badRequest('The preseason is not the phase this save is in');
  }
  if (week > PRESEASON_WEEKS) {
    throw badRequest(`The preseason is ${String(PRESEASON_WEEKS)} games; week ${String(week)} is past it`);
  }

  const { league } = await loadEngineState(db, saveId);
  const seed32 = rngSeed32(save.rng_seed);
  const fixtures = await db<FixtureRow[]>`
    select game_id, home_team_id, away_team_id, neutral_site from public.season_schedule
     where save_id = ${saveId} and season = ${season} and week = ${week}
       and competition = 'PRESEASON'
     order by game_id`;
  if (fixtures.length === 0) {
    throw badRequest(`No preseason fixtures are written for week ${String(week)}`);
  }

  const chart = await readDepthChart(db, saveId, save.user_team_id);
  const out = await absentPlayers(db, saveId, season, week);
  const base = withUserChart(
    teamStatesFor(league.teamIds, league.players,
      { fronts: league.fronts, coaches: league.coaches }),
    save.user_team_id, chart);
  // Everybody's chart is rotated, every club's. A preseason played off the
  // regular-season depth chart gives the starters the snaps and the men camp
  // is actually about none at all -- which is exactly backwards, and is what
  // the evaluation test caught: not one bubble player had a grade, because not
  // one bubble player had been on the field.
  const teams = new Map(
    [...base].map(([id, team]) => [id, { ...team, depthChart: rotateForPreseason(team.depthChart, week) }]));

  // Its own stream. A preseason drawn from the regular season's generator
  // would shift every result of the year that follows it.
  const rng = createRng(gameStream(seed32, season, 100 + week));
  const games = await playFixtures(
    db, saveId, season, week, PRESEASON_WEEKS, 'PRESEASON', fixtures, teams, out, rng);

  if (games.played.length > 0) {
    await db`
      update public.season_schedule set status = 'FINAL'
       where save_id = ${saveId} and game_id = any(${games.played.map((g) => g.gameId)}::text[])`;
  }
  // Injuries and totals are real. Standings are not touched at all -- there is
  // deliberately no recomputeStandings call here, and that absence is the
  // feature.
  await upsertInjuries(db, saveId, season, week, games.injuries);
  await rollUpSeasonStats(db, saveId, season);

  // What the staff saw. The only thing August leaves behind that a manager
  // acts on.
  await writeEvaluations(db, saveId, season, save.user_team_id,
    await gradePreseason(db, saveId, season, save.user_team_id));

  const mine = games.played.find((g) => g.result.homeTeamId === save.user_team_id
    || g.result.awayTeamId === save.user_team_id);
  const home = mine !== undefined && mine.result.homeTeamId === save.user_team_id;

  return {
    season,
    week,
    remaining: Math.max(0, PRESEASON_WEEKS - week),
    played: games.played.length,
    abandoned: games.abandoned,
    ourScore: mine === undefined ? null : (home ? mine.result.homeScore : mine.result.awayScore),
    theirScore: mine === undefined ? null : (home ? mine.result.awayScore : mine.result.homeScore),
  };
}

/**
 * The order a preseason group takes the field in.
 *
 * Rotated by the round, so over three games every man in a room gets a look
 * and no man plays all three. That is what a preseason is for and it is the
 * only way the evaluation means anything: graded off the regular-season chart,
 * the starters play, the fringe players never appear, and the bubble is
 * decided on practice alone.
 *
 * A rotation rather than a reversal, because a reversal would hand the third
 * string every snap of every game and tell you nothing about the second. The
 * specialists are left alone -- a club has one kicker and rotating him means
 * playing nobody.
 */
export function rotateForPreseason(
  chart: Readonly<Record<PositionGroup, readonly string[]>>, week: number,
): Record<PositionGroup, readonly string[]> {
  const out = {} as Record<PositionGroup, readonly string[]>;
  for (const group of Object.keys(chart) as PositionGroup[]) {
    const order = chart[group];
    if (order.length <= 1 || group === 'K' || group === 'P' || group === 'LS') {
      out[group] = order;
      continue;
    }
    const by = week % order.length;
    out[group] = [...order.slice(by), ...order.slice(0, by)];
  }
  return out;
}

/** The user's club plays the chart the manager set; everybody else plays their
 *  own. Copied in shape from the week runner, which does the same thing for
 *  the same reason. */
function withUserChart(
  teams: Map<string, TeamState>, teamId: string,
  chart: Readonly<Record<string, readonly string[]>>,
): Map<string, TeamState> {
  const team = teams.get(teamId);
  if (team === undefined || Object.keys(chart).length === 0) return teams;
  teams.set(teamId, { ...team, depthChart: { ...team.depthChart, ...chart } });
  return teams;
}
