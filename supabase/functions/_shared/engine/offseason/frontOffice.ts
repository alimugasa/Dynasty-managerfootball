// The club as a decision-maker.
//
// Everything the draft and free agency need to know about a team that is not on
// its roster: how good its scouts are, how much the owner will spend, whether it
// is trying to win now or build, and how attractive it looks to a player
// weighing offers.

/** Dollars. Grows off a base year, bounded so a fifty-season save stays sane. */
export interface CapRules {
  readonly season: number;
  readonly salaryCap: number;
  readonly veteranMinimum: number;
  readonly rookiePoolTop: number;
  readonly rosterLimit: number;
  readonly draftRounds: number;
}

const BASE_SEASON = 2026;
const BASE_CAP = 302_000_000;
const BASE_MINIMUM = 1_120_000;
const BASE_ROOKIE_TOP = 11_000_000;
const CAP_GROWTH = 1.062;

export function capRules(season: number): CapRules {
  const growth = Math.pow(CAP_GROWTH, season - BASE_SEASON);
  return {
    season,
    salaryCap: Math.round(BASE_CAP * growth),
    veteranMinimum: Math.round(BASE_MINIMUM * growth),
    rookiePoolTop: Math.round(BASE_ROOKIE_TOP * growth),
    rosterLimit: 53,
    draftRounds: 7,
  };
}

export interface TeamFront {
  readonly id: string;
  /** 0-99. Sets how tightly this club can read a prospect. */
  readonly scouting: number;
  /** 0-99. Owner willingness to spend against the cap. */
  readonly spending: number;
  /** 0-1. Win-now clubs weight need over the best player available. */
  readonly winNow: number;
  /** 0-99. What a player is buying into beyond the money. */
  readonly prestige: number;
  /** 0-1. Recent success, which is what a contender-minded player reads. */
  readonly recentWinRate: number;
  /**
   * Share of the league-average scouting budget this club spends, roughly
   * 0.5 to 1.5. Distinct from department quality: a poor department that spends
   * heavily still narrows its ranges, and a good one that does not, does not.
   */
  readonly scoutingSpend: number;
}

export function defaultFront(id: string): TeamFront {
  return {
    id, scouting: 60, spending: 60, winNow: 0.5,
    prestige: 55, recentWinRate: 0.5, scoutingSpend: 1,
  };
}
