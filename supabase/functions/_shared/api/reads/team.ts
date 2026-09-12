// team: the managed club's week.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { parseStreak } from '../project/standings.ts';
import { POSITION_GROUPS } from '../../engine/types.ts';
import { ROUND_LABEL, type PlayoffRound } from '../../engine/playoffs.ts';

export interface TeamIn { readonly saveId: string }

export interface StandingOut {
  readonly wins: number; readonly losses: number; readonly ties: number;
  readonly pointsFor: number; readonly pointsAgainst: number; readonly streak: number;
}

export interface FixtureOut {
  readonly gameId: string; readonly week: number;
  readonly homeTeamId: string; readonly awayTeamId: string;
  readonly homeScore: number | null; readonly awayScore: number | null;
  /** The round's name on a playoff fixture; null in the regular season. */
  readonly round?: string | null;
}

export interface SquadRow {
  readonly playerId: string; readonly name: string; readonly group: string;
  readonly age: number; readonly overall: number;
}

export interface TeamOut {
  readonly standing: StandingOut | null;
  /** League position by record, 1 = best. Null before a game is played. */
  readonly rank: number | null;
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

    const [ranked] = await sql<{ rank: string }[]>`
      select rank from (
        select team_id, rank() over (order by win_pct desc, points_for - points_against desc, team_id) as rank
          from public.standings where save_id = ${s.id} and season = ${s.season}
      ) r where team_id = ${teamId}`;

    const [{ n: squadSize } = { n: '0' }] = await sql<{ n: string }[]>`
      select count(*) as n from public.team_rosters where save_id = ${s.id} and team_id = ${teamId}`;

    const [next] = await sql<{
      game_id: string; week: number; home_team_id: string; away_team_id: string; playoff_round: string | null;
    }[]>`
      select game_id, week, home_team_id, away_team_id, playoff_round from public.season_schedule
       where save_id = ${s.id} and season = ${s.season} and week = ${s.week}
         and (home_team_id = ${teamId} or away_team_id = ${teamId})`;

    const [last] = await sql<{
      game_id: string; week: number; home_team_id: string; away_team_id: string;
      home_score: number; away_score: number; playoff_round: string | null;
    }[]>`
      select g.game_id, g.week, g.home_team_id, g.away_team_id, g.home_score, g.away_score,
             f.playoff_round
        from public.game_results g
        join public.season_schedule f on f.save_id = g.save_id and f.game_id = g.game_id
       where g.save_id = ${s.id} and g.season = ${s.season}
         and (g.home_team_id = ${teamId} or g.away_team_id = ${teamId})
       order by g.week desc limit 1`;

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
      rank: ranked === undefined || standing === undefined
        || standing.wins + standing.losses + standing.ties === 0 ? null : Number(ranked.rank),
      squadSize: Number(squadSize),
      next: next === undefined ? null : {
        gameId: next.game_id, week: next.week, homeTeamId: next.home_team_id,
        awayTeamId: next.away_team_id, homeScore: null, awayScore: null,
        round: next.playoff_round === null ? null : (ROUND_LABEL[next.playoff_round as PlayoffRound] ?? next.playoff_round),
      },
      last: last === undefined ? null : {
        gameId: last.game_id, week: last.week, homeTeamId: last.home_team_id,
        awayTeamId: last.away_team_id, homeScore: last.home_score, awayScore: last.away_score,
        round: last.playoff_round === null ? null : (ROUND_LABEL[last.playoff_round as PlayoffRound] ?? last.playoff_round),
      },
      squad: squad.map((r) => ({
        playerId: r.player_id, name: r.display_name, group: r.slot, age: r.age,
        overall: r.overall_rating,
      })),
    };
  },
};
