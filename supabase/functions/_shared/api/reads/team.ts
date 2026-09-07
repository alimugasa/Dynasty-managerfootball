// team: the managed club's week.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { parseStreak } from '../project/standings.ts';
import { POSITION_GROUPS } from '../../engine/types.ts';

export interface TeamIn { readonly saveId: string }

export interface StandingOut {
  readonly wins: number; readonly losses: number; readonly ties: number;
  readonly pointsFor: number; readonly pointsAgainst: number; readonly streak: number;
}

export interface FixtureOut {
  readonly gameId: string; readonly week: number;
  readonly homeTeamId: string; readonly awayTeamId: string;
  readonly homeScore: number | null; readonly awayScore: number | null;
}

export interface SquadRow {
  readonly playerId: string; readonly name: string; readonly group: string;
  readonly age: number; readonly overall: number;
}

export interface TeamOut {
  readonly standing: StandingOut | null;
  readonly squadSize: number;
  readonly next: FixtureOut | null;
  readonly last: FixtureOut | null;
  /** The top of the depth chart, in the order it plays. */
  readonly squad: readonly SquadRow[];
}

export const team: Handler<TeamIn, TeamOut> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const teamId = s.user_team_id;

    const [standing] = await sql<{
      wins: number; losses: number; ties: number; points_for: number; points_against: number;
      streak: string | null;
    }[]>`
      select wins, losses, ties, points_for, points_against, streak from public.standings
       where save_id = ${s.id} and season = ${s.season} and team_id = ${teamId}`;

    const [{ n: squadSize } = { n: '0' }] = await sql<{ n: string }[]>`
      select count(*) as n from public.team_rosters where save_id = ${s.id} and team_id = ${teamId}`;

    const [next] = await sql<{ game_id: string; week: number; home_team_id: string; away_team_id: string }[]>`
      select game_id, week, home_team_id, away_team_id from public.season_schedule
       where save_id = ${s.id} and season = ${s.season} and week = ${s.week}
         and (home_team_id = ${teamId} or away_team_id = ${teamId})`;

    const [last] = await sql<{
      game_id: string; week: number; home_team_id: string; away_team_id: string;
      home_score: number; away_score: number;
    }[]>`
      select game_id, week, home_team_id, away_team_id, home_score, away_score
        from public.game_results
       where save_id = ${s.id} and season = ${s.season}
         and (home_team_id = ${teamId} or away_team_id = ${teamId})
       order by week desc limit 1`;

    const squad = await sql<{ player_id: string; display_name: string; slot: string; age: number; overall_rating: number }[]>`
      select d.player_id, p.display_name, d.slot, p.age, p.overall_rating
        from public.team_depth_charts d
        join public.players p on p.save_id = d.save_id and p.player_id = d.player_id
       where d.save_id = ${s.id} and d.team_id = ${teamId}
         and d.slot = any(${[...POSITION_GROUPS]}::text[])
       order by array_position(${[...POSITION_GROUPS]}::text[], d.slot), d.depth_order
       limit 5`;

    return {
      standing: standing === undefined ? null : {
        wins: standing.wins, losses: standing.losses, ties: standing.ties,
        pointsFor: standing.points_for, pointsAgainst: standing.points_against,
        streak: parseStreak(standing.streak),
      },
      squadSize: Number(squadSize),
      next: next === undefined ? null : {
        gameId: next.game_id, week: next.week, homeTeamId: next.home_team_id,
        awayTeamId: next.away_team_id, homeScore: null, awayScore: null,
      },
      last: last === undefined ? null : {
        gameId: last.game_id, week: last.week, homeTeamId: last.home_team_id,
        awayTeamId: last.away_team_id, homeScore: last.home_score, awayScore: last.away_score,
      },
      squad: squad.map((r) => ({
        playerId: r.player_id, name: r.display_name, group: r.slot, age: r.age,
        overall: r.overall_rating,
      })),
    };
  },
};
