// league: the table and the season's leaders.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { GROUP_OF } from '../../engine/careerWorld.ts';

export interface LeagueIn { readonly saveId: string }

export interface TableRow {
  readonly teamId: string; readonly conferenceId: string; readonly divisionId: string;
  readonly wins: number; readonly losses: number; readonly ties: number;
  readonly played: number;
  readonly pointsFor: number; readonly pointsAgainst: number;
  /** 1-7 once the regular season has ended and the club is in; null otherwise. */
  readonly seed: number | null;
  readonly divisionWinner: boolean;
}

export interface LeaderRow {
  readonly playerId: string; readonly name: string; readonly group: string; readonly value: number;
}

export interface LeagueOut {
  readonly standings: readonly TableRow[];
  readonly leaders: { readonly pass: readonly LeaderRow[]; readonly rush: readonly LeaderRow[]; readonly rec: readonly LeaderRow[] };
  readonly gamesPlayed: number;
  /** Set once the final has been played. */
  readonly champion: string | null;
}

interface StatRow { player_id: string; display_name: string; position: string; value: number }

export const league: Handler<LeagueIn, LeagueOut> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const table = await sql<{
      team_id: string; conference_id: string; division_id: string;
      wins: number; losses: number; ties: number;
      points_for: number; points_against: number;
      conference_seed: number | null; playoff_status: string | null;
    }[]>`
      select st.team_id, t.conference_id, t.division_id, st.wins, st.losses, st.ties,
             st.points_for, st.points_against, st.conference_seed, st.playoff_status
        from public.standings st
        join public.teams t on t.save_id = st.save_id and t.team_id = st.team_id
       where st.save_id = ${s.id} and st.season = ${s.season}
       order by st.win_pct desc, (st.points_for - st.points_against) desc, st.team_id`;
    const [champion] = await sql<{ team_id: string }[]>`
      select team_id from public.league_history
       where save_id = ${s.id} and season = ${s.season} and playoff_result = 'CHAMPION'`;

    const leaders = async (column: 'pass_yards' | 'rush_yards' | 'rec_yards'): Promise<LeaderRow[]> => {
      const rows = await sql<StatRow[]>`
        select ps.player_id, p.display_name, p.position, ps.${sql(column)} as value
          from public.player_season_stats ps
          join public.players p on p.save_id = ps.save_id and p.player_id = ps.player_id
         where ps.save_id = ${s.id} and ps.season = ${s.season} and ps.competition = 'REGULAR'
           and ps.${sql(column)} > 0
         order by ps.${sql(column)} desc, ps.player_id limit 5`;
      return rows.map((r) => ({
        playerId: r.player_id, name: r.display_name,
        group: GROUP_OF[r.position] ?? r.position, value: r.value,
      }));
    };

    const [{ n } = { n: '0' }] = await sql<{ n: string }[]>`
      select count(*) as n from public.game_results
       where save_id = ${s.id} and season = ${s.season} and competition = 'REGULAR'`;

    return {
      standings: table.map((r) => ({
        teamId: r.team_id, conferenceId: r.conference_id, divisionId: r.division_id,
        wins: r.wins, losses: r.losses, ties: r.ties, played: r.wins + r.losses + r.ties,
        pointsFor: r.points_for, pointsAgainst: r.points_against,
        seed: r.conference_seed,
        divisionWinner: r.playoff_status === 'CLINCHED_DIVISION' || r.playoff_status === 'CLINCHED_BYE',
      })),
      leaders: { pass: await leaders('pass_yards'), rush: await leaders('rush_yards'), rec: await leaders('rec_yards') },
      gamesPlayed: Number(n),
      champion: champion?.team_id ?? null,
    };
  },
};
