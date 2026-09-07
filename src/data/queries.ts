// The read contract, one entry per region a screen draws.
//
// This is a description of what each screen may ask the database for, not a
// Supabase client -- there is no connection yet. It exists now because the
// audit in docs/PERFORMANCE.md found that the shape of a read is decided by
// whoever wires the screen, and the wrong shape is invisible until the save is
// old. Naming every read here, with its bound, means the decision is made once
// and reviewed, rather than fifteen times in fifteen components.
//
// Three rules, each of which the audit caught being broken:
//
//   1. Every list read is a page. See src/data/page.ts.
//   2. No read's cost may grow with the age of the save. A read over history is
//      served by a summary table, not by folding the rows it summarises.
//   3. A row's detail is fetched with its list, never per row. One query that
//      returns 53 joined rows beats 54 queries, and the join must carry the
//      same filter the list has or it reads the whole table.

import { type Page, type PageRequest } from './page';

export interface SaveScope {
  readonly saveId: string;
  readonly season: number;
}

/** Bound on a read, stated rather than implied. Checked by test: a read
 *  declared BOUNDED_CONSTANT that grows with the save is a defect. */
export type Bound =
  /** Fixed number of rows regardless of save age (one club, one season). */
  | 'CONSTANT'
  /** Grows with one season, which is itself fixed: 32 clubs, 272 games. */
  | 'SEASON'
  /** Grows with the number of seasons played. Only legal for a summary read
   *  that returns one row per season -- fifty rows after fifty years. */
  | 'PER_SEASON'
  /** Paged. Cost per page is constant; the list may be any length. */
  | 'PAGED';

export interface ReadSpec {
  readonly id: string;
  readonly screen: string;
  readonly table: string;
  readonly bound: Bound;
  /** Index or summary table that makes the bound true. Named so that dropping
   *  one shows up here as well as in a slow screen. */
  readonly servedBy: string;
}

/**
 * Every read the app is allowed to issue.
 *
 * A screen that needs something not in this list needs an entry here first,
 * which is the point: the review happens when the read is added, not when a
 * dynasty reaches its fortieth season and the Team tab takes four seconds.
 */
export const READS: readonly ReadSpec[] = [
  { id: 'team.summary', screen: 'Team', table: 'team_season_summary',
    bound: 'CONSTANT', servedBy: 'primary key' },
  { id: 'team.standing', screen: 'Team', table: 'standings',
    bound: 'CONSTANT', servedBy: 'primary key' },
  { id: 'team.topPerformers', screen: 'Team', table: 'player_season_stats',
    bound: 'CONSTANT', servedBy: 'pss_team_idx' },
  { id: 'team.history', screen: 'Team', table: 'team_season_summary',
    bound: 'PER_SEASON', servedBy: 'tss_team_idx' },

  { id: 'league.standings', screen: 'League', table: 'standings',
    bound: 'SEASON', servedBy: 'primary key' },
  { id: 'league.passLeaders', screen: 'League', table: 'player_season_stats',
    bound: 'CONSTANT', servedBy: 'pss_leaderboard_idx' },
  { id: 'league.rushLeaders', screen: 'League', table: 'player_season_stats',
    bound: 'CONSTANT', servedBy: 'pss_rush_leaders_idx' },
  { id: 'league.recLeaders', screen: 'League', table: 'player_season_stats',
    bound: 'CONSTANT', servedBy: 'pss_rec_leaders_idx' },
  { id: 'league.sackLeaders', screen: 'League', table: 'player_season_stats',
    bound: 'CONSTANT', servedBy: 'pss_sack_leaders_idx' },
  { id: 'league.recordBook', screen: 'League', table: 'player_career_totals',
    bound: 'CONSTANT', servedBy: 'pct_*_idx' },

  { id: 'schedule.week', screen: 'Schedule', table: 'game_results',
    bound: 'CONSTANT', servedBy: 'game_results_week_idx' },
  { id: 'schedule.teamSeason', screen: 'Schedule', table: 'game_results',
    bound: 'CONSTANT', servedBy: 'game_results_home_idx, game_results_away_idx' },

  { id: 'roster.squad', screen: 'Roster', table: 'players',
    bound: 'PAGED', servedBy: 'players_team_idx + pss_player_idx' },

  { id: 'office.transactions', screen: 'Office', table: 'transactions',
    bound: 'PAGED', servedBy: 'transactions_feed_desc_idx' },

  { id: 'player.career', screen: 'Player', table: 'player_career_totals',
    bound: 'CONSTANT', servedBy: 'primary key' },
  { id: 'player.seasons', screen: 'Player', table: 'player_season_stats',
    bound: 'PER_SEASON', servedBy: 'pss_player_idx' },

  { id: 'transactions.feed', screen: 'Transactions', table: 'transactions',
    bound: 'PAGED', servedBy: 'transactions_feed_desc_idx' },
  { id: 'news.feed', screen: 'News', table: 'news',
    bound: 'PAGED', servedBy: 'news_importance_idx' },
];

export function readSpec(id: string): ReadSpec | undefined {
  return READS.find((r) => r.id === id);
}

/** The reads that must be paged. A list read missing from here is a list read
 *  nobody bounded. */
export function pagedReads(): readonly ReadSpec[] {
  return READS.filter((r) => r.bound === 'PAGED');
}

// ------------------------------------------------------------------ shapes
// What a paged read returns. The client is not written yet; these are the
// signatures it will implement, kept here so the screens can be wired against
// an interface rather than against whatever the first call site invents.

export interface RosterRow {
  readonly playerId: string;
  readonly name: string;
  readonly group: string;
  readonly overall: number;
  /** Null when the player has no stat line for this season -- a rookie, or a
   *  player who did not play. Null is the answer, not zero. */
  readonly passYards: number | null;
  readonly rushYards: number | null;
  readonly recYards: number | null;
}

export interface TransactionRow {
  readonly transactionId: number;
  readonly season: number;
  readonly kind: string;
  readonly teamId: string | null;
  readonly detail: string | null;
}

export interface DataSource {
  roster(scope: SaveScope, teamId: string, page?: PageRequest): Promise<Page<RosterRow>>;
  transactions(scope: SaveScope, page?: PageRequest): Promise<Page<TransactionRow>>;
}
