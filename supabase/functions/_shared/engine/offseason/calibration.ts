// Offseason constants.
//
// Peak ages, decline rates and position ceilings are the reference engine's
// (legacy/engine/world.py and offseason.py), which validates its population
// dynamics over fifty simulated seasons. The intake constants are the ones that
// fix the talent-drift bug documented in legacy/ENGINE.md: draft classes are
// calibrated to hold the starting league distribution, rather than the league
// being allowed to settle wherever the intake happens to put it.

import type { PositionGroup } from '../types.ts';

/** Age at which each group stops improving and starts declining. */
export const PEAK_AGE: Readonly<Record<PositionGroup, number>> = {
  QB: 29, RB: 25, WR: 27, TE: 27, OL: 29,
  EDGE: 27, DT: 28, LB: 27, CB: 26, S: 27,
  K: 32, P: 32, LS: 32,
};

/** Rating points lost per year once past peak, before the age ramp. Running
 *  backs fall off a cliff; kickers barely move. */
export const DECLINE_RATE: Readonly<Record<PositionGroup, number>> = {
  QB: 1.1, RB: 2.85, WR: 1.75, TE: 1.55, OL: 1.2,
  EDGE: 1.7, DT: 1.55, LB: 1.8, CB: 2.3, S: 1.8,
  K: 0.7, P: 0.7, LS: 0.7,
};

/** Hard ceiling on ability by group. */
export const POSITION_CEILING: Readonly<Record<PositionGroup, number>> = {
  QB: 99, RB: 94, WR: 98, TE: 95, OL: 97,
  EDGE: 98, DT: 96, LB: 95, CB: 97, S: 95,
  K: 87, P: 85, LS: 80,
};

/** How much accumulated experience can add on the mental side, by group. A
 *  quarterback keeps learning long after the athleticism goes; a corner does
 *  not get much back for it. */
export const MENTAL_CAP: Readonly<Record<PositionGroup, number>> = {
  QB: 7, OL: 5, S: 4, LB: 4, TE: 3.5,
  RB: 2.5, WR: 2.5, EDGE: 2.5, DT: 2.5, CB: 2.5, K: 2.5, P: 2.5, LS: 2.5,
};

export const OFFSEASON = {
  development: {
    /** Share of the remaining gap to potential closed in a good year. */
    growthGapShare: 0.17,
    /** Breakout and bust. Multiplies the year's growth, so the same player can
     *  gain nothing or three times the expected amount. The wide right tail is
     *  what produces a genuine breakout; the floor at zero is a lost year. */
    growthVarianceSd: 0.42,
    growthVarianceMin: 0,
    growthVarianceMax: 2.4,
    /** Playing time. A rotational player develops, a healthy scratch less so. */
    benchGrowthFactor: 0.45,

    /** Decline ramps with years past peak rather than arriving all at once. */
    declineBase: 0.42,
    declinePerYearPastPeak: 0.16,
    declineVarianceSd: 0.4,
    declineVarianceMin: 0.15,
    declineVarianceMax: 2.3,

    /** Injury-driven decline. Career games missed beyond this threshold
     *  accelerate the fall; a body that has broken down keeps breaking down. */
    injuryDeclineThreshold: 12,
    injuryDeclinePerGame: 0.012,

    /** Experience keeps accruing on the mental side after the athletic peak. */
    mentalGainPerSeason: 0.55,

    abilityFloor: 30,
  },

  retirement: {
    /** Nobody retires before this age. */
    minimumAge: 25,
    /** Hazard from age: 0.016 * (years past peak ^ 1.85). Superlinear, so the
     *  tail thins out gradually instead of everyone quitting at one age. */
    agePerYearPastPeak: 0.016,
    ageExponent: 1.85,
    /** Fringe players wash out. This is the mode of the retirement-age
     *  distribution, not the tail. */
    fringeAbility: 62,
    fringeBase: 0.11,
    fringePerPoint: 0.02,
    /** Nobody wants him. */
    unsignedPenalty: 0.3,
    /** A body that has spent years hurt. */
    injuryThreshold: 20,
    injuryPerGame: 0.005,
    /** Stars keep playing well past the point others stop. */
    starAbility: 84,
    starMultiplier: 0.32,
    /** A champion late in his career walks away on top. */
    ringLateCareerBonus: 0.05,
    hardAge: 40,
    hardAgeHazard: 0.55,
    maximumHazard: 0.96,
  },

  intake: {
    /** Prospects enter the pipeline three years before they are drafted and
     *  develop inside it, so a class is partly formed before anyone sees it. */
    pipelineYears: 3,
    // Sized for surplus at every position rather than for the total. A class
    // that meets league-wide demand on average still leaves clubs unable to
    // hire a kicker in the years it happens to be short of them, and a spare
    // prospect nobody signs costs nothing.
    classSize: 340,
    /**
     * The talent-drift fix. legacy/ENGINE.md records a 30-season run losing
     * 0.29 rating points a season -- twelve straight years of the league
     * quietly getting worse -- and the cause being a discontinuity between the
     * starting database and the steady state the intake implied, not
     * instability. Every parameter setting converged; they just converged to
     * different levels.
     *
     * These are the values that converge to the level the seed database
     * already sits at, which is the distribution anchored to real football and
     * therefore the one worth preserving.
     */
    //
    // Found by sweep, not by guesswork: scripts/drift-report/sweep.ts runs each
    // candidate to equilibrium and reads the level off. The reference engine's
    // own 57.8 settles this league at 71.2, roughly three and a half points
    // below where the seed database sits, because the roster accounting here
    // differs from the reference's. Every setting in the sweep converged; they
    // converged to different levels, which is precisely the finding
    // legacy/ENGINE.md records.
    classAbilityMean: 58.6,
    classAbilitySd: 9,
    classAbilityMin: 32,
    classAbilityMax: 88,
    /** Potential above current ability, gamma distributed: most prospects have
     *  a little headroom, a few have a great deal. */
    potentialShape: 2,
    potentialScale: 6.9,
    /** Prospect development inside the pipeline. */
    prospectGrowthGapShare: 0.22,
    prospectGrowthVarianceSd: 0.5,
    prospectGrowthVarianceMax: 2.5,

    devRateMean: 1,
    devRateSd: 0.33,
    devRateMin: 0.2,
    devRateMax: 2.2,
    workEthicMean: 70,
    workEthicSd: 14,
    durabilityMean: 72,
    durabilitySd: 14,
    footballIqMean: 70,
    footballIqSd: 13,
  },

  grading: {
    /**
     * The decoupling constant, and the most important number in this file.
     *
     * A season grade is a noisy realisation of ability, not a readout of it.
     * Ability is standardised across the graded population each season, so this
     * weight IS the correlation between ability and form; the per-game term
     * below dilutes it slightly, and the value is set so the realised
     * ability-to-grade correlation lands at 0.55.
     *
     * At 1.0 the game has no story: the best player always grades best, every
     * scouting decision is trivial, and a breakout is impossible. At 0 ability
     * is decoration. 0.55 leaves ability clearly dominant in aggregate while
     * letting a 79 out-grade a 94 in a given year, which is what the sport
     * actually looks like.
     */
    abilityWeight: 0.569,
    /** Per-game variation around the season's form. Averages out over a
     *  season, which is why a season grade is a better read on ability than any
     *  single game. */
    perGameNoiseSd: 0.72,
    gamesPerSeason: 17,

    /** Grade scale. Linear through the middle, compressed above the knee so
     *  elite seasons do not all pile up against the ceiling. */
    gradeMean: 62,
    gradeSd: 14,
    gradeKnee: 88,
    gradeKneeSlope: 0.45,
    gradeMin: 0,
    gradeMax: 99.9,
  },

  reputation: {
    /** Reputation chases ability but never catches it, which is the mechanism
     *  that makes declining veterans get overpaid in free agency and young
     *  risers get underpaid. */
    convergence: 0.34,
    /** Accolades stick to a name long after the ability has gone. */
    perAccolade: 0.22,
  },
} as const;
