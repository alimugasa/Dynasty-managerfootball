// The news engine's inputs and output.
//
// legacy/ENGINE.md lists the news engine among the things the reference never
// built. It is written here from the events the simulation already produces: no
// story is invented, and every headline traces to a fact that happened.
//
// Output rows match the `news` table from migration 0008 minus the three columns
// the server owns -- save_id, news_id and published_at. The engine is pure and
// has no business minting identities or reading a clock.

export const NEWS_CATEGORIES = [
  'UPSET', 'STREAK', 'MILESTONE', 'INJURY', 'HOT_SEAT', 'AWARD_RACE',
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

/** A row destined for `news`. */
export interface NewsItem {
  readonly season: number;
  readonly week: number;
  readonly phase: string;
  readonly category: NewsCategory;
  readonly headline: string;
  readonly body: string | null;
  readonly teamId: string | null;
  readonly playerId: string | null;
  readonly gameId: string | null;
  /** 1 (filler) to 5 (the story of the week). Drives ordering in the feed. */
  readonly importance: number;
}

// ---------------------------------------------------------------- inputs

export interface TeamNews {
  readonly teamId: string;
  /** Metro plus nickname, as the feed prints it. */
  readonly name: string;
  readonly nickname: string;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  /** Positive for a winning run, negative for a losing one. */
  readonly streak: number;
  /** Roster strength, used to judge whether a result was an upset. */
  readonly rating: number;
}

export interface GameNews {
  readonly gameId: string;
  readonly week: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly overtime: boolean;
}

export interface PlayerNews {
  readonly playerId: string;
  readonly name: string;
  readonly teamId: string;
  readonly position: string;
  /** This week's line, for single-game milestones. */
  readonly gamePassYards: number;
  readonly gameRushYards: number;
  readonly gameRecYards: number;
  readonly gameTouchdowns: number;
  /** Season totals after this week, for cumulative milestones. */
  readonly seasonPassYards: number;
  readonly seasonRushYards: number;
  readonly seasonRecYards: number;
  readonly seasonSacks: number;
}

export interface InjuryNews {
  readonly playerId: string;
  readonly name: string;
  readonly teamId: string;
  readonly position: string;
  readonly severity: 'minor' | 'shortTerm' | 'majorTerm' | 'seasonEnding';
  readonly weeksOut: number;
  /** A starter going down is a different story from a reserve. */
  readonly starter: boolean;
}

export interface CoachNews {
  readonly coachId: string;
  readonly name: string;
  readonly teamId: string;
  readonly wins: number;
  readonly losses: number;
  /** What the roster said this club should win. */
  readonly expectedWins: number;
  readonly seasonsWithTeam: number;
  /** 0-100. Above the threshold in calibration is a hot seat. */
  readonly hotSeat: number;
}

export interface AwardRaceNews {
  /** Original award names only; see docs/IP-POLICY.md. */
  readonly awardCode: string;
  readonly awardName: string;
  readonly leaderPlayerId: string;
  readonly leaderName: string;
  readonly leaderTeamId: string;
  readonly leaderValue: number;
  readonly statLabel: string;
  /** Margin over the next player. A tight race is the story. */
  readonly margin: number;
  readonly chaserName: string | null;
}

/** Everything the generator needs about one week. */
export interface WeekInput {
  readonly season: number;
  readonly week: number;
  readonly phase: string;
  /** Total weeks, so "with three to play" reads correctly. */
  readonly totalWeeks: number;
  readonly games: readonly GameNews[];
  readonly teams: readonly TeamNews[];
  readonly players: readonly PlayerNews[];
  readonly injuries: readonly InjuryNews[];
  readonly coaches: readonly CoachNews[];
  readonly awardRaces: readonly AwardRaceNews[];
}

/**
 * A candidate story, before it has been written.
 *
 * Detection and phrasing are kept apart on purpose: a detector decides that
 * something happened and how much it matters, and knows nothing about English.
 * Mixing the two makes it impossible to add a phrasing without re-reading the
 * football logic, or to change a threshold without touching prose.
 */
export interface NewsFact {
  readonly category: NewsCategory;
  /** Template family within the category, e.g. 'upset.big'. */
  readonly kind: string;
  readonly importance: number;
  readonly slots: Readonly<Record<string, string>>;
  readonly teamId: string | null;
  readonly playerId: string | null;
  readonly gameId: string | null;
}
