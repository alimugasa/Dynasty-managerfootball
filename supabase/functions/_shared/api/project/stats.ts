// Game lines in, season totals out.
//
// player_game_stats holds what the engine emitted, one row per player per
// game. player_season_stats is rolled up from it after every week, as a full
// recompute of the season: the totals are then a function of the lines and
// cannot disagree with them. Columns the engine does not count -- starts,
// fumbles, tackles for loss, passes defended, forced fumbles, snaps, passer
// rating -- are written NULL. There is no number for them, so no number is
// written.

import type { Db } from '../db.ts';
import type { GameResult, PlayerStatLine } from '../../engine/types.ts';

export interface PlayedGame {
  readonly gameId: string;
  readonly season: number;
  readonly week: number;
  readonly result: GameResult;
}

export async function insertGameResult(db: Db, saveId: string, g: PlayedGame): Promise<void> {
  const { result: r } = g;
  const h = r.home;
  const a = r.away;
  await db`
    insert into public.game_results (
      save_id, game_id, season, week, competition, home_team_id, away_team_id,
      home_score, away_score, overtime,
      home_plays, home_pass_att, home_completions, home_pass_yards, home_pass_tds,
      home_interceptions, home_sacks_allowed, home_rushes, home_rush_yards, home_rush_tds,
      home_field_goals, home_turnovers, home_first_downs, home_third_down_att,
      home_third_down_conv, home_possession_seconds, home_drives,
      away_plays, away_pass_att, away_completions, away_pass_yards, away_pass_tds,
      away_interceptions, away_sacks_allowed, away_rushes, away_rush_yards, away_rush_tds,
      away_field_goals, away_turnovers, away_first_downs, away_third_down_att,
      away_third_down_conv, away_possession_seconds, away_drives,
      weather_wind, weather_cold, weather_precip)
    values (
      ${saveId}, ${g.gameId}, ${g.season}, ${g.week}, 'REGULAR', ${r.homeTeamId}, ${r.awayTeamId},
      ${r.homeScore}, ${r.awayScore}, ${r.overtime},
      ${h.plays}, ${h.passAttempts}, ${h.completions}, ${h.passYards}, ${h.passTouchdowns},
      ${h.interceptionsThrown}, ${h.sacksAllowed}, ${h.rushes}, ${h.rushYards}, ${h.rushTouchdowns},
      ${h.fieldGoalsMade}, ${h.turnovers}, ${h.firstDowns}, ${h.thirdDownAttempts},
      ${h.thirdDownConversions}, ${Math.round(h.possessionSeconds)}, ${h.drives},
      ${a.plays}, ${a.passAttempts}, ${a.completions}, ${a.passYards}, ${a.passTouchdowns},
      ${a.interceptionsThrown}, ${a.sacksAllowed}, ${a.rushes}, ${a.rushYards}, ${a.rushTouchdowns},
      ${a.fieldGoalsMade}, ${a.turnovers}, ${a.firstDowns}, ${a.thirdDownAttempts},
      ${a.thirdDownConversions}, ${Math.round(a.possessionSeconds)}, ${a.drives},
      ${Math.round(r.weather.wind)}, ${Math.round(r.weather.cold)}, ${r.weather.precipitation})`;
  await insertGameLines(db, saveId, g, r.players);
}

async function insertGameLines(
  db: Db, saveId: string, g: PlayedGame, lines: readonly PlayerStatLine[],
): Promise<void> {
  if (lines.length === 0) return;
  const col = <K extends keyof PlayerStatLine>(key: K): PlayerStatLine[K][] =>
    lines.map((l) => l[key]);
  await db`
    insert into public.player_game_stats (
      save_id, game_id, season, week, competition, player_id, team_id, snaps,
      pass_att, completions, pass_yards, pass_tds, interceptions, sacks_taken,
      rushes, rush_yards, rush_tds, targets, receptions, rec_yards, rec_tds,
      tackles, sacks, ints_caught, fg_made, fg_att, xp_made, xp_att, punts, punt_yards)
    select ${saveId}, ${g.gameId}, ${g.season}, ${g.week}, 'REGULAR', u.player_id, u.team_id, null,
           u.pass_att, u.completions, u.pass_yards, u.pass_tds, u.interceptions, u.sacks_taken,
           u.rushes, u.rush_yards, u.rush_tds, u.targets, u.receptions, u.rec_yards, u.rec_tds,
           u.tackles, u.sacks, u.ints_caught, u.fg_made, u.fg_att, u.xp_made, u.xp_att,
           u.punts, u.punt_yards
      from unnest(
        ${col('playerId')}::text[], ${col('teamId')}::text[],
        ${col('passAttempts')}::int[], ${col('completions')}::int[],
        ${col('passYards')}::int[], ${col('passTouchdowns')}::int[],
        ${col('interceptionsThrown')}::int[], ${col('sacksTaken')}::int[],
        ${col('rushes')}::int[], ${col('rushYards')}::int[], ${col('rushTouchdowns')}::int[],
        ${col('targets')}::int[], ${col('receptions')}::int[],
        ${col('receivingYards')}::int[], ${col('receivingTouchdowns')}::int[],
        ${col('tackles')}::int[], ${col('sacks')}::numeric[], ${col('interceptions')}::int[],
        ${col('fieldGoalsMade')}::int[], ${col('fieldGoalsAttempted')}::int[],
        ${col('extraPointsMade')}::int[], ${col('extraPointsAttempted')}::int[],
        ${col('punts')}::int[], ${col('puntYards')}::int[]
      ) as u(player_id, team_id, pass_att, completions, pass_yards, pass_tds, interceptions,
             sacks_taken, rushes, rush_yards, rush_tds, targets, receptions, rec_yards, rec_tds,
             tackles, sacks, ints_caught, fg_made, fg_att, xp_made, xp_att, punts, punt_yards)`;
}

/** The season's totals, from its lines. The club is the one the player was
 *  with in his latest game. */
export async function rollUpSeasonStats(db: Db, saveId: string, season: number): Promise<void> {
  await db`
    insert into public.player_season_stats (
      save_id, season, competition, player_id, team_id, position,
      games_played, games_started, pass_att, completions, pass_yards, pass_tds,
      interceptions, sacks_taken, passer_rating, rushes, rush_yards, rush_tds, fumbles,
      targets, receptions, rec_yards, rec_tds, tackles, sacks, tackles_for_loss,
      ints_caught, passes_defended, forced_fumbles, fg_made, fg_att, xp_made, xp_att,
      punts, punt_yards, snaps)
    select g.save_id, g.season, g.competition, g.player_id,
           (array_agg(g.team_id order by g.week desc))[1], p.position,
           count(*), null, sum(g.pass_att), sum(g.completions), sum(g.pass_yards),
           sum(g.pass_tds), sum(g.interceptions), sum(g.sacks_taken), null,
           sum(g.rushes), sum(g.rush_yards), sum(g.rush_tds), null,
           sum(g.targets), sum(g.receptions), sum(g.rec_yards), sum(g.rec_tds),
           sum(g.tackles), sum(g.sacks), null, sum(g.ints_caught), null, null,
           sum(g.fg_made), sum(g.fg_att), sum(g.xp_made), sum(g.xp_att),
           sum(g.punts), sum(g.punt_yards), null
      from public.player_game_stats g
      join public.players p on p.save_id = g.save_id and p.player_id = g.player_id
     where g.save_id = ${saveId} and g.season = ${season}
     group by g.save_id, g.season, g.competition, g.player_id, p.position
    on conflict (save_id, season, competition, player_id) do update
      set team_id = excluded.team_id, position = excluded.position,
          games_played = excluded.games_played,
          pass_att = excluded.pass_att, completions = excluded.completions,
          pass_yards = excluded.pass_yards, pass_tds = excluded.pass_tds,
          interceptions = excluded.interceptions, sacks_taken = excluded.sacks_taken,
          rushes = excluded.rushes, rush_yards = excluded.rush_yards,
          rush_tds = excluded.rush_tds, targets = excluded.targets,
          receptions = excluded.receptions, rec_yards = excluded.rec_yards,
          rec_tds = excluded.rec_tds, tackles = excluded.tackles, sacks = excluded.sacks,
          ints_caught = excluded.ints_caught, fg_made = excluded.fg_made,
          fg_att = excluded.fg_att, xp_made = excluded.xp_made, xp_att = excluded.xp_att,
          punts = excluded.punts, punt_yards = excluded.punt_yards`;
}

export interface InjuryRow {
  readonly playerId: string;
  readonly teamId: string;
  readonly severity: string;
  readonly weeksOut: number;
  readonly seasonEnding: boolean;
}

const DESIGNATION: Readonly<Record<string, string>> = {
  minor: 'MINOR', shortTerm: 'SHORT_TERM', majorTerm: 'MAJOR_TERM', seasonEnding: 'SEASON_ENDING',
};

/** One row per player: the injury that keeps him out longest wins. The seed's
 *  own injury rows carry no season and are superseded by the first real one.
 *  The boolean column goes through text: the driver types a boolean array
 *  parameter as a scalar and Postgres refuses the cast. */
export async function upsertInjuries(
  db: Db, saveId: string, season: number, week: number, injuries: readonly InjuryRow[],
): Promise<void> {
  if (injuries.length === 0) return;
  await db`
    insert into public.player_injuries (
      save_id, player_id, team_id, designation, injury_type, weeks_out_estimate,
      season_ending, injured_season, injured_week, data_class)
    select ${saveId}, u.player_id, u.team_id, u.designation, null, u.weeks_out,
           u.season_ending, ${season}, ${week}, 'ENGINE'
      from unnest(
        ${injuries.map((i) => i.playerId)}::text[],
        ${injuries.map((i) => i.teamId)}::text[],
        ${injuries.map((i) => DESIGNATION[i.severity] ?? i.severity.toUpperCase())}::text[],
        ${injuries.map((i) => i.weeksOut)}::int[],
        ${injuries.map((i) => (i.seasonEnding ? 'true' : 'false'))}::text[]::boolean[]
      ) as u(player_id, team_id, designation, weeks_out, season_ending)
    on conflict (save_id, player_id) do update
      set team_id = excluded.team_id, designation = excluded.designation,
          injury_type = excluded.injury_type,
          weeks_out_estimate = excluded.weeks_out_estimate,
          season_ending = excluded.season_ending,
          injured_season = excluded.injured_season, injured_week = excluded.injured_week,
          data_class = excluded.data_class
      where (excluded.injured_season, excluded.injured_week + excluded.weeks_out_estimate)
          > (coalesce(player_injuries.injured_season, 0),
             coalesce(player_injuries.injured_week + player_injuries.weeks_out_estimate, 0))`;
}

/**
 * Who cannot play this week. An injury in week w for n weeks keeps a player
 * out of weeks w+1 .. w+n-1 -- the same arithmetic the in-memory host used,
 * where an absence of n was decremented at the end of the week it was set.
 */
export async function absentPlayers(
  db: Db, saveId: string, season: number, week: number,
): Promise<Set<string>> {
  const rows = await db<{ player_id: string }[]>`
    select player_id from public.player_injuries
     where save_id = ${saveId} and injured_season = ${season}
       and injured_week < ${week}
       and injured_week + weeks_out_estimate - 1 >= ${week}`;
  return new Set(rows.map((r) => r.player_id));
}

/** Weeks a player still misses after this week, for the roster screen. */
export async function weeksOut(
  db: Db, saveId: string, season: number, week: number, teamId: string,
): Promise<Map<string, number>> {
  const rows = await db<{ player_id: string; remaining: number }[]>`
    select player_id, (injured_week + weeks_out_estimate - ${week})::int as remaining
      from public.player_injuries
     where save_id = ${saveId} and team_id = ${teamId} and injured_season = ${season}
       and injured_week + weeks_out_estimate - ${week} >= 1`;
  return new Map(rows.map((r) => [r.player_id, r.remaining]));
}
