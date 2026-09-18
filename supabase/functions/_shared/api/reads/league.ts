// league: the table, and who leads it in what.
//
// Two things, split three ways. The table is split by conference and division
// because that is how a league is organised; the leaders are split by what
// they lead in, and by competition -- a seventeen-game regular season and a
// four-game playoff run are different records and are never summed
// (ARCHITECTURE.md, src/domain/competition.ts).
//
// The order the table comes back in is the league's own: win percentage, then
// points difference, which is what the engine ranks by. A client may sort the
// rows it is given for its own reasons; it may not compute a different league
// position and call it the standing.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { optionalString, rawOf, requireString } from '../parse.ts';
import { GROUP_OF } from '../../engine/careerWorld.ts';

export interface LeagueIn {
  readonly saveId: string;
  /** REGULAR or PLAYOFF. The table is the regular season's either way: there
   *  is no playoff table, only a bracket. */
  readonly competition?: string;
}

export interface TableRow {
  readonly teamId: string; readonly conferenceId: string; readonly divisionId: string;
  readonly wins: number; readonly losses: number; readonly ties: number;
  readonly played: number;
  readonly pointsFor: number; readonly pointsAgainst: number;
  /** 1-7 once the regular season has ended and the club is in; null otherwise. */
  readonly seed: number | null;
  readonly divisionWinner: boolean;
  /** Positive for a winning run, negative for a losing one, 0 for neither. */
  readonly streak: number;
}

export interface LeaderRow {
  readonly playerId: string;
  readonly name: string;
  readonly group: string;
  readonly teamId: string;
  readonly value: number;
  /** Games the value was made in, so a leader on four is not read as one on
   *  seventeen. */
  readonly games: number;
}

/** Which side of the game a board belongs to, so the screen can split them. */
export const LEADER_SIDES = ['OFFENSE', 'DEFENSE', 'KICKING'] as const;
export type LeaderSide = (typeof LEADER_SIDES)[number];

/** A conference or a division, by its own name. The names are the league's,
 *  read from the tables the seed wrote: a screen that split the table into
 *  "American" and "National" out of its own head would be inventing them. */
export interface LeagueGroup {
  readonly id: string;
  readonly name: string;
  /** The conference a division sits in. Null on a conference itself. */
  readonly conferenceId: string | null;
}

export interface LeaderBoard {
  readonly key: string;
  readonly label: string;
  readonly side: LeaderSide;
  /** What the number is, for the column head. */
  readonly unit: string;
  readonly rows: readonly LeaderRow[];
}

export interface LeagueOut {
  readonly standings: readonly TableRow[];
  /** In the league's own order, so the split control lists them as it does. */
  readonly conferences: readonly LeagueGroup[];
  readonly divisions: readonly LeagueGroup[];
  readonly boards: readonly LeaderBoard[];
  readonly competition: string;
  /** Games played in the competition asked about. Zero means nothing to lead. */
  readonly gamesPlayed: number;
  /** Set once the final has been played. */
  readonly champion: string | null;
}

/** The boards, in the order they are shown. One query each: a single query
 *  ranking eleven columns at once would be one plan for eleven questions. */
const BOARDS: readonly {
  readonly key: string; readonly label: string; readonly side: LeaderSide;
  readonly unit: string; readonly column: string;
}[] = [
  { key: 'passYards', label: 'Passing yards', side: 'OFFENSE', unit: 'yds', column: 'pass_yards' },
  { key: 'passTds', label: 'Passing touchdowns', side: 'OFFENSE', unit: 'td', column: 'pass_tds' },
  { key: 'rushYards', label: 'Rushing yards', side: 'OFFENSE', unit: 'yds', column: 'rush_yards' },
  { key: 'rushTds', label: 'Rushing touchdowns', side: 'OFFENSE', unit: 'td', column: 'rush_tds' },
  { key: 'recYards', label: 'Receiving yards', side: 'OFFENSE', unit: 'yds', column: 'rec_yards' },
  { key: 'recTds', label: 'Receiving touchdowns', side: 'OFFENSE', unit: 'td', column: 'rec_tds' },
  { key: 'receptions', label: 'Receptions', side: 'OFFENSE', unit: 'rec', column: 'receptions' },
  { key: 'sacks', label: 'Sacks', side: 'DEFENSE', unit: 'sk', column: 'sacks' },
  { key: 'interceptions', label: 'Interceptions', side: 'DEFENSE', unit: 'int', column: 'ints_caught' },
  { key: 'tackles', label: 'Tackles', side: 'DEFENSE', unit: 'tkl', column: 'tackles' },
  { key: 'fieldGoals', label: 'Field goals', side: 'KICKING', unit: 'fg', column: 'fg_made' },
  { key: 'puntYards', label: 'Punting yards', side: 'KICKING', unit: 'yds', column: 'punt_yards' },
];

/** The keys, in order. Exported so the play-test rig's copy of this list can
 *  be held against it by a test rather than by memory. */
export const BOARD_KEYS: readonly string[] = BOARDS.map((b) => b.key);

/** How deep a board goes. Ten is a leaderboard; five is a podium. */
export const BOARD_DEPTH = 10;

interface StatRow {
  player_id: string; display_name: string; position: string; team_id: string;
  value: string; games_played: number;
}

export const league: Handler<LeagueIn, LeagueOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const competition = optionalString(r, 'competition');
    return {
      saveId: requireString(r, 'saveId'),
      competition: competition === 'PLAYOFF' ? 'PLAYOFF' : 'REGULAR',
    };
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const competition = input.competition === 'PLAYOFF' ? 'PLAYOFF' : 'REGULAR';

    const table = await sql<{
      team_id: string; conference_id: string; division_id: string;
      wins: number; losses: number; ties: number;
      points_for: number; points_against: number;
      conference_seed: number | null; playoff_status: string | null; streak: string | null;
    }[]>`
      select st.team_id, t.conference_id, t.division_id, st.wins, st.losses, st.ties,
             st.points_for, st.points_against, st.conference_seed, st.playoff_status, st.streak
        from public.standings st
        join public.teams t on t.save_id = st.save_id and t.team_id = st.team_id
       where st.save_id = ${s.id} and st.season = ${s.season}
       order by st.win_pct desc, (st.points_for - st.points_against) desc, st.team_id`;

    const conferences = await sql<{ conference_id: string; name: string }[]>`
      select conference_id, name from public.league_conferences
       where save_id = ${s.id} order by conference_id`;

    const divisions = await sql<{ division_id: string; conference_id: string; name: string }[]>`
      select division_id, conference_id, name from public.league_divisions
       where save_id = ${s.id} order by conference_id, division_id`;

    const [champion] = await sql<{ team_id: string }[]>`
      select team_id from public.league_history
       where save_id = ${s.id} and season = ${s.season} and playoff_result = 'CHAMPION'`;

    const board = async (column: string): Promise<LeaderRow[]> => {
      const rows = await sql<StatRow[]>`
        select ps.player_id, p.display_name, p.position, ps.team_id,
               ps.${sql(column)}::text as value, ps.games_played
          from public.player_season_stats ps
          join public.players p on p.save_id = ps.save_id and p.player_id = ps.player_id
         where ps.save_id = ${s.id} and ps.season = ${s.season}
           and ps.competition = ${competition} and ps.${sql(column)} > 0
         order by ps.${sql(column)} desc, ps.player_id limit ${BOARD_DEPTH}`;
      return rows.map((r) => ({
        playerId: r.player_id, name: r.display_name,
        group: GROUP_OF[r.position] ?? r.position, teamId: r.team_id,
        value: Number(r.value), games: r.games_played,
      }));
    };

    const boards: LeaderBoard[] = [];
    for (const spec of BOARDS) {
      boards.push({
        key: spec.key, label: spec.label, side: spec.side, unit: spec.unit,
        rows: await board(spec.column),
      });
    }

    const [{ n } = { n: '0' }] = await sql<{ n: string }[]>`
      select count(*) as n from public.game_results
       where save_id = ${s.id} and season = ${s.season} and competition = ${competition}`;

    const streakOf = (text: string | null): number => {
      if (text === null || text === '') return 0;
      const n2 = Number(text.slice(1));
      return text.startsWith('L') ? -n2 : n2;
    };

    return {
      standings: table.map((r) => ({
        teamId: r.team_id, conferenceId: r.conference_id, divisionId: r.division_id,
        wins: r.wins, losses: r.losses, ties: r.ties, played: r.wins + r.losses + r.ties,
        pointsFor: r.points_for, pointsAgainst: r.points_against,
        seed: r.conference_seed,
        divisionWinner: r.playoff_status === 'CLINCHED_DIVISION' || r.playoff_status === 'CLINCHED_BYE',
        streak: streakOf(r.streak),
      })),
      conferences: conferences.map((c) => ({ id: c.conference_id, name: c.name, conferenceId: null })),
      divisions: divisions.map((d) => ({ id: d.division_id, name: d.name, conferenceId: d.conference_id })),
      boards,
      competition,
      gamesPlayed: Number(n),
      champion: champion?.team_id ?? null,
    };
  },
};
