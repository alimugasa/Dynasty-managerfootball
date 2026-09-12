// What each screen reads, before and after.
//
// "Before" is not a strawman. Each one is the query set a straightforward
// implementation produces when the screen is wired the obvious way: fetch the
// rows the screen names, filter and sort them in TypeScript, and fetch a
// player's stat line when the row needs it. That is what the codebase would
// have got, because every one of these screens currently renders a skeleton and
// nothing about the schema pushes an implementer away from it.
//
// "After" is the same screen served by the indexes and summary tables in
// migration 0012, through the paging contract in src/data/page.ts.
//
// Both halves are executed. Nothing in the report is estimated.

export const SAVE = '11111111-2222-3333-4444-555555555555';
const TEAM = 'BUF';
const SEASON = 2075;

/** One statement, or a list standing in for an N+1: a query per row is counted
 *  as the several queries it is, and executed as such. */
export interface Region {
  readonly name: string;
  readonly before: readonly string[];
  readonly after: readonly string[];
}

export interface ScreenSpec {
  readonly screen: string;
  readonly regions: readonly Region[];
}

/** The N+1 a list screen produces when each row fetches its own detail. */
function perRow(sqlFor: (id: string) => string, ids: readonly string[]): string[] {
  return ids.map(sqlFor);
}

/** 53 player ids, standing in for a roster. Resolved at load time from the
 *  fixture so the N+1 runs against ids that exist. */
export function rosterIds(rows: readonly string[]): readonly string[] {
  return rows.slice(0, 53);
}

export function screensFor(roster: readonly string[]): ScreenSpec[] {
  return [
    {
      screen: 'Team',
      regions: [
        {
          name: 'club record + season rates',
          before: [
            // The whole season of results, folded in TypeScript.
            `select * from game_results where save_id = '${SAVE}' and season = ${SEASON}`,
            `select * from standings where save_id = '${SAVE}' and season = ${SEASON}`,
          ],
          after: [
            `select * from team_season_summary where save_id = '${SAVE}'
               and season = ${SEASON} and team_id = '${TEAM}' and competition = 'REGULAR'`,
            `select * from standings where save_id = '${SAVE}'
               and season = ${SEASON} and team_id = '${TEAM}'`,
          ],
        },
        {
          name: 'top performers',
          before: [
            `select * from player_season_stats where save_id = '${SAVE}' and season = ${SEASON}`,
          ],
          after: [
            `select player_id, position, pass_yards, rush_yards, rec_yards
               from player_season_stats
              where save_id = '${SAVE}' and season = ${SEASON}
                and competition = 'REGULAR' and team_id = '${TEAM}'
              order by rec_yards desc limit 5`,
          ],
        },
        {
          name: 'club history (50 seasons)',
          before: [
            // Every game the club ever played, to draw fifty rows.
            `select season, home_team_id, away_team_id, home_score, away_score
               from game_results
              where save_id = '${SAVE}'
                and (home_team_id = '${TEAM}' or away_team_id = '${TEAM}')`,
          ],
          after: [
            `select season, games, points_for, points_against, points_per_game
               from team_season_summary
              where save_id = '${SAVE}' and team_id = '${TEAM}' and competition = 'REGULAR'
              order by season desc limit 50`,
          ],
        },
      ],
    },

    {
      screen: 'League',
      regions: [
        {
          name: 'standings',
          before: [`select * from standings where save_id = '${SAVE}' and season = ${SEASON}`],
          after: [
            `select team_id, wins, losses, ties, win_pct, conference_seed
               from standings
              where save_id = '${SAVE}' and season = ${SEASON}
              order by win_pct desc, team_id limit 32`,
          ],
        },
        {
          name: 'leaders, four categories',
          before: [
            // One full-season read per category, sorted on read. Only pass_yards
            // had an index before 0012; the other three sorted 1,700 rows each.
            `select player_id, pass_yards from player_season_stats
              where save_id = '${SAVE}' and season = ${SEASON} and competition = 'REGULAR'
              order by pass_yards desc limit 5`,
            `select player_id, rush_yards from player_season_stats
              where save_id = '${SAVE}' and season = ${SEASON} and competition = 'REGULAR'
              order by rush_yards desc limit 5`,
            `select player_id, rec_yards from player_season_stats
              where save_id = '${SAVE}' and season = ${SEASON} and competition = 'REGULAR'
              order by rec_yards desc limit 5`,
            `select player_id, sacks from player_season_stats
              where save_id = '${SAVE}' and season = ${SEASON} and competition = 'REGULAR'
              order by sacks desc limit 5`,
          ],
          after: [
            `select player_id, pass_yards from player_season_stats
              where save_id = '${SAVE}' and season = ${SEASON} and competition = 'REGULAR'
              order by pass_yards desc limit 5`,
            `select player_id, rush_yards from player_season_stats
              where save_id = '${SAVE}' and season = ${SEASON}
                and competition = 'REGULAR' and rush_yards > 0
              order by rush_yards desc limit 5`,
            `select player_id, rec_yards from player_season_stats
              where save_id = '${SAVE}' and season = ${SEASON}
                and competition = 'REGULAR' and rec_yards > 0
              order by rec_yards desc limit 5`,
            `select player_id, sacks from player_season_stats
              where save_id = '${SAVE}' and season = ${SEASON}
                and competition = 'REGULAR' and sacks > 0
              order by sacks desc limit 5`,
          ],
        },
        {
          name: 'all-time record book',
          before: [
            // The query that does not survive a long save: the whole stat table
            // folded to rank 13,792 careers, every time the screen opens.
            `select player_id, sum(pass_yards) as y from player_season_stats
              where save_id = '${SAVE}' and competition = 'REGULAR'
              group by player_id order by y desc limit 10`,
          ],
          after: [
            `select player_id, pass_yards from player_career_totals
              where save_id = '${SAVE}' and competition = 'REGULAR' and pass_yards > 0
              order by pass_yards desc limit 10`,
          ],
        },
      ],
    },

    {
      screen: 'Schedule',
      regions: [
        {
          name: 'one week of fixtures',
          before: [
            `select * from game_results where save_id = '${SAVE}' and season = ${SEASON}`,
          ],
          after: [
            `select game_id, home_team_id, away_team_id, home_score, away_score
               from game_results
              where save_id = '${SAVE}' and season = ${SEASON} and week = 9
              order by game_id limit 20`,
          ],
        },
        {
          name: "a club's season",
          before: [
            `select * from game_results
              where save_id = '${SAVE}' and season = ${SEASON}
                and (home_team_id = '${TEAM}' or away_team_id = '${TEAM}')`,
          ],
          after: [
            `select game_id, week, away_team_id as opponent from game_results
              where save_id = '${SAVE}' and home_team_id = '${TEAM}' and season = ${SEASON}
             union all
             select game_id, week, home_team_id from game_results
              where save_id = '${SAVE}' and away_team_id = '${TEAM}' and season = ${SEASON}
              order by week limit 20`,
          ],
        },
      ],
    },

    {
      screen: 'Roster',
      regions: [
        {
          name: 'squad list with season lines',
          before: [
            `select * from players where save_id = '${SAVE}' and team_id = '${TEAM}'`,
            // ...then one stat query per player on the roster.
            ...perRow((id) => `select * from player_season_stats
              where save_id = '${SAVE}' and player_id = '${id}' and season = ${SEASON}`, roster),
          ],
          after: [
            // Filtered to the club. Without the team predicate this join reads
            // every player who ever existed -- the first version of this query
            // did exactly that, and the benchmark reported it reading MORE rows
            // than the N+1 it replaced.
            `select p.player_id, p.display_name, p.position_group, p.overall_rating,
                    s.pass_yards, s.rush_yards, s.rec_yards
               from players p
               left join player_season_stats s
                 on s.save_id = p.save_id and s.player_id = p.player_id
                and s.season = ${SEASON} and s.competition = 'REGULAR'
              where p.save_id = '${SAVE}' and p.team_id = '${TEAM}'
              order by p.overall_rating desc, p.player_id limit 50`,
          ],
        },
      ],
    },

    {
      screen: 'Office',
      regions: [
        {
          name: 'transaction preview (5 rows)',
          before: [
            `select * from transactions where save_id = '${SAVE}' order by season desc`,
          ],
          after: [
            `select transaction_id, season, kind, team_id, detail from transactions
              where save_id = '${SAVE}'
              order by season desc, transaction_id desc limit 5`,
          ],
        },
      ],
    },

    {
      screen: 'Player (drill-down)',
      regions: [
        {
          name: 'career totals + season history',
          before: [
            `select * from player_season_stats
              where save_id = '${SAVE}' and player_id = '${roster[0] ?? 'X'}'`,
            `select * from player_season_grades
              where save_id = '${SAVE}' and player_id = '${roster[0] ?? 'X'}'`,
          ],
          after: [
            `select * from player_career_totals
              where save_id = '${SAVE}' and player_id = '${roster[0] ?? 'X'}'
                and competition = 'REGULAR'`,
            `select season, games_played, pass_yards, rush_yards, rec_yards
               from player_season_stats
              where save_id = '${SAVE}' and player_id = '${roster[0] ?? 'X'}'
              order by season desc limit 25`,
          ],
        },
      ],
    },

    {
      screen: 'Transactions (drill-down)',
      regions: [
        {
          name: 'first page of the feed',
          before: [
            `select * from transactions where save_id = '${SAVE}' order by season desc`,
          ],
          after: [
            `select transaction_id, season, kind, team_id, detail from transactions
              where save_id = '${SAVE}' and season = ${SEASON}
              order by transaction_id desc limit 51`,
          ],
        },
        {
          name: 'page 100 of the feed',
          before: [
            // Offset paging: the work grows with the page number.
            `select * from transactions where save_id = '${SAVE}'
              order by season desc, transaction_id desc offset 5000 limit 50`,
          ],
          after: [
            // Keyset: seeks to the cursor, so page 100 costs what page 1 costs.
            `select transaction_id, season, kind, team_id, detail from transactions
              where save_id = '${SAVE}'
                and (season, transaction_id) < (${SEASON}, 40000)
              order by season desc, transaction_id desc limit 50`,
          ],
        },
      ],
    },
  ];
}
