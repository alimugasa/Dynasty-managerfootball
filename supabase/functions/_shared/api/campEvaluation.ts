// What camp learned, written down.
//
// The evaluation is the only thing August leaves behind that a manager acts
// on, and it is kept strictly apart from what a player *is*. A grade is the
// coaching staff's read: it moves fast, it is wrong sometimes, and it never
// touches an overall rating. That separation is the whole design. A preseason
// that quietly raised ratings would be a second draft, and the fringe players
// it is actually about would be the ones it moved least.
//
// Who swings, and by how much, is the part worth getting right. A rookie, a
// backup and a fringe veteran are being *found out* in August -- nobody knows
// what they are yet, so three good quarters genuinely change the picture. An
// established starter is not: he has four hundred snaps of evidence behind
// him, and a quiet afternoon against somebody's third team says nothing.

import type { Db } from './db.ts';
import { clamp } from '../engine/calibration.ts';
import {
  rosterProbability, rosterStatus, type CampPlayer, type RosterStatus,
} from './campBoard.ts';
import { POSITION_GROUPS, type PositionGroup } from '../engine/types.ts';
import { GROUP_OF } from '../engine/careerWorld.ts';

export interface Evaluation {
  readonly playerId: string;
  readonly teamId: string;
  readonly practiceGrade: number;
  readonly preseasonGrade: number | null;
  readonly preseasonGames: number;
  readonly rosterProbability: number;
  readonly status: RosterStatus;
  readonly gradeDelta: number;
}

/**
 * How far a player's evaluation is allowed to move on one afternoon.
 *
 * The request asks for larger swings on rookies, young players, backups and
 * fringe players than on established stars, and this is where that lives. It
 * is a multiplier on the whole move rather than a special case per player
 * type, so a 23-year-old fourth-stringer compounds two reasons to be unsure
 * about him and an established 29-year-old starter compounds none.
 */
export function evaluationSwing(p: {
  readonly overall: number;
  readonly age: number;
  readonly experienceYears: number;
  readonly depth: number;
  readonly starters: number;
}): number {
  let swing = 1;
  // Nobody knows what a rookie is yet.
  if (p.experienceYears === 0) swing += 0.9;
  else if (p.experienceYears <= 2) swing += 0.5;
  // A man who is not playing is being looked at rather than watched.
  if (p.depth > p.starters) swing += 0.4;
  if (p.depth > p.starters + 2) swing += 0.3;
  // A career's worth of evidence is not overturned by one August.
  if (p.overall >= 82) swing -= 0.55;
  else if (p.overall >= 75) swing -= 0.3;
  if (p.age >= 30) swing -= 0.15;
  return clamp(swing, 0.25, 2.2);
}

interface StatRow {
  player_id: string; team_id: string; position: string;
  overall_rating: number; potential_rating: number; age: number;
  experience_years: number; draft_round: number | null; draft_year: number | null;
  games: number; pass_yards: number; rush_yards: number; rec_yards: number;
  tackles: number; sacks: string; ints_caught: number; fumbles: number;
  cap_hit: string | null; depth_order: number | null; injured: boolean;
}

/**
 * A 0-100 read on what a player did in the preseason so far.
 *
 * Production per appearance against a positional expectation, which is the
 * only honest way to compare a backup guard with a third receiver: neither of
 * them has a counting stat the other has.
 *
 * Per game rather than per snap, which is what this was first written as. The
 * engine does not model snap counts -- player_game_stats.snaps is written NULL
 * on purpose, because a number nobody simulated is not a number -- so a
 * per-snap grade divided by nothing and graded the whole roster null. Games
 * are what this league can count.
 *
 * A player who has not appeared has no grade: null, never fifty. "Has not
 * played" and "played to exactly the average" are different facts, and a
 * bubble player's month turns on which of them is true.
 */
export function preseasonGrade(row: {
  readonly group: PositionGroup;
  readonly games: number;
  readonly passYards: number; readonly rushYards: number; readonly recYards: number;
  readonly tackles: number; readonly sacks: number;
  readonly turnoversForced: number; readonly fumbles: number;
}): number | null {
  if (row.games <= 0) return null;
  const per = (n: number): number => n / row.games;
  // What a good afternoon looks like, by group. These are expectations, not
  // records: grading against a record would put every honest performance in
  // the same band at the bottom. A preseason afternoon is a fraction of a
  // starter's Sunday, which is what these numbers are scaled to.
  const offence = per(row.passYards) / 130 + per(row.rushYards) / 35 + per(row.recYards) / 32;
  const defence = per(row.tackles) / 4.5 + per(row.sacks) / 0.6 + per(row.turnoversForced) / 0.35;
  const raw = row.group === 'QB' || row.group === 'RB' || row.group === 'WR' || row.group === 'TE'
    ? offence
    : row.group === 'OL' || row.group === 'K' || row.group === 'P' || row.group === 'LS'
      // The engine books no line or specialist production at all, so these are
      // graded on availability alone and the screen says so rather than
      // printing a number nobody measured.
      ? 0.5
      : defence;
  // Turnovers given away cost, whoever gave them away.
  const penalty = per(row.fumbles) / 0.75;
  return Math.round(clamp((raw - penalty) * 50 + 50, 0, 100));
}

/**
 * Every player on the club, graded.
 *
 * The practice grade is deterministic from the player rather than rolled: it
 * is what the staff thinks of a man they already know, so it tracks his rating
 * and his upside. The preseason grade is what he actually did.
 */
export async function gradePreseason(
  db: Db, saveId: string, season: number, teamId: string,
): Promise<readonly Evaluation[]> {
  const rows = await db<StatRow[]>`
    with mine as (
      select r.player_id, r.team_id, p.position, p.overall_rating, p.potential_rating,
             p.age, p.experience_years, p.draft_round, p.draft_year,
             d.depth_order,
             (i.player_id is not null and coalesce(i.weeks_out_estimate, 0) > 1) as injured
        from public.team_rosters r
        join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
        -- The chart's slot is the engine's position group ('OL'), not the
        -- seed's display grouping ('O-Line'), and the two are different
        -- vocabularies that happen to live one column apart. Joining on the
        -- wrong one matched nothing and left every player at depth 99.
        left join public.team_depth_charts d
          on d.save_id = r.save_id and d.player_id = r.player_id
         and d.slot = any(${[...POSITION_GROUPS]}::text[])
        left join public.player_injuries i
          on i.save_id = r.save_id and i.player_id = r.player_id
       where r.save_id = ${saveId} and r.team_id = ${teamId}
    )
    -- One row per player, whatever the joins do. A player who appears twice
    -- here is meaningless -- he has one evaluation by definition -- and an
    -- ON CONFLICT insert built from a duplicated list fails outright rather
    -- than quietly writing the wrong thing, which is how this was found.
    select distinct on (m.player_id) m.*,
           coalesce(s.games_played, 0) as games, coalesce(s.pass_yards, 0) as pass_yards,
           coalesce(s.rush_yards, 0) as rush_yards, coalesce(s.rec_yards, 0) as rec_yards,
           coalesce(s.tackles, 0) as tackles, coalesce(s.sacks, 0)::text as sacks,
           coalesce(s.ints_caught, 0) as ints_caught, coalesce(s.fumbles, 0) as fumbles,
           c.average_annual_value::text as cap_hit
      from mine m
      left join public.player_season_stats s
        on s.save_id = ${saveId} and s.player_id = m.player_id
       and s.season = ${season} and s.competition = 'PRESEASON'
      left join public.player_contracts c
        on c.save_id = ${saveId} and c.player_id = m.player_id and c.contract_status = 'ACTIVE'
     order by m.player_id, m.depth_order nulls last`;

  return rows.map((r): Evaluation => {
    // The engine's group, derived from the position. players.position_group
    // is the seed's display label ('Secondary') and is a different
    // vocabulary entirely.
    const group: PositionGroup = GROUP_OF[r.position] ?? 'LS';
    // What the staff thinks of a man they already know: his rating, plus what
    // they believe is still in there.
    const practice = Math.round(clamp(
      50 + (r.overall_rating - 68) * 1.6 + Math.max(0, r.potential_rating - r.overall_rating) * 0.8,
      0, 100));
    const played = preseasonGrade({
      group,
      games: r.games,
      passYards: r.pass_yards, rushYards: r.rush_yards, recYards: r.rec_yards,
      tackles: r.tackles, sacks: Number(r.sacks),
      turnoversForced: r.ints_caught, fumbles: r.fumbles,
    });

    const depth = r.depth_order ?? 99;
    const player: CampPlayer = {
      playerId: r.player_id, name: '', group,
      overall: r.overall_rating, potential: r.potential_rating,
      age: r.age, experienceYears: r.experience_years,
      capHit: Number(r.cap_hit ?? 0), deadMoney: 0,
      draftRound: r.draft_round,
      rookie: r.experience_years === 0,
      depth, groupSize: 0,
      specialTeams: specialTeamsValue({ ...r, position: group }), schemeFit: 50,
      injured: r.injured,
      practiceGrade: practice,
      preseasonGrade: played,
    };
    const probability = rosterProbability(player);
    return {
      playerId: r.player_id,
      teamId: r.team_id,
      practiceGrade: practice,
      preseasonGrade: played,
      preseasonGames: r.games,
      rosterProbability: probability,
      status: rosterStatus(player, probability),
      // How far the read has moved from where it started. Zero until a
      // preseason grade exists, because nothing has moved it.
      gradeDelta: played === null ? 0 : played - practice,
    };
  });
}

/**
 * What a player is worth on a coverage team.
 *
 * The engine models no kick coverage, so this is a derivation and is named as
 * one everywhere it is shown. It is what a coverage unit is actually made of:
 * young, cheap, fast-position players who are not starting. A 33-year-old
 * left tackle scores nothing here and should.
 */
export function specialTeamsValue(p: {
  readonly position: string; readonly age: number;
  readonly experience_years: number; readonly depth_order: number | null;
}): number {
  const COVERAGE = new Set(['WR', 'RB', 'TE', 'LB', 'S', 'CB', 'EDGE']);
  let score = COVERAGE.has(p.position) ? 62 : 30;
  if (p.age <= 25) score += 14;
  else if (p.age >= 30) score -= 16;
  if (p.experience_years <= 2) score += 8;
  // A starter is not on the punt team.
  if ((p.depth_order ?? 99) <= 2) score -= 12;
  return Math.round(clamp(score, 0, 100));
}

/** Writes the club's evaluations, replacing whatever the last round wrote. */
export async function writeEvaluations(
  db: Db, saveId: string, season: number, teamId: string,
  evaluations: readonly Evaluation[],
): Promise<void> {
  if (evaluations.length === 0) return;
  await db`
    insert into public.camp_evaluations (
      save_id, season, player_id, team_id, practice_grade, preseason_grade,
      preseason_games, roster_probability, status, grade_delta)
    select ${saveId}, ${season}, u.player_id, ${teamId}, u.practice, u.preseason,
           u.games, u.probability, u.status, u.delta
      from unnest(
        ${evaluations.map((e) => e.playerId)}::text[],
        ${evaluations.map((e) => e.practiceGrade)}::int[],
        ${evaluations.map((e) => e.preseasonGrade)}::int[],
        ${evaluations.map((e) => e.preseasonGames)}::int[],
        ${evaluations.map((e) => e.rosterProbability)}::int[],
        ${evaluations.map((e) => e.status)}::text[],
        ${evaluations.map((e) => e.gradeDelta)}::int[]
      ) as u(player_id, practice, preseason, games, probability, status, delta)
    on conflict (save_id, season, player_id) do update
      set practice_grade = excluded.practice_grade,
          preseason_grade = excluded.preseason_grade,
          preseason_games = excluded.preseason_games,
          roster_probability = excluded.roster_probability,
          status = excluded.status,
          grade_delta = excluded.grade_delta,
          updated_at = now()`;
}
