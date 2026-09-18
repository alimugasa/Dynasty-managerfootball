// Every tunable constant in the engine, in one place.
//
// The passing and rushing rate formulas are taken from the calibrated Python
// reference in legacy/engine/season.py, which validates 17/17 against real
// football ranges. That engine generates a team's box score in one shot from a
// unit-rating differential; this one applies the same rate formulas per snap, so
// the calibration carries over while the output gains play-level detail.
//
// `diff` throughout is an offensive unit rating minus the opposing defensive
// unit rating, on the 0-99 player scale, plus home-field advantage. It is
// roughly zero for evenly matched units.

export const CALIBRATION = {
  /** Home field. legacy/engine/season.py uses 1.9 on the pass differential and
   *  half that on the run. Neutral sites get none of it. */
  homeField: {
    passDiff: 1.9,
    runDiff: 0.95,
    /** Crowd noise: extra pre-snap penalty chance for the visiting offense. */
    awayFalseStartRate: 0.018,
  },

  pass: {
    sackRateBase: 0.0555,
    sackRatePerDiff: -0.0022,
    sackRateMin: 0.015,
    sackRateMax: 0.16,

    completionBase: 0.675,
    completionPerDiff: 0.0068,
    completionMin: 0.35,
    completionMax: 0.8,
    completionWindPenalty: 0.09,

    interceptionBase: 0.0205,
    interceptionPerDiff: -0.0013,
    interceptionMin: 0.004,
    interceptionMax: 0.075,
    interceptionWindPenalty: 0.004,

    /** Share of completions that are deep shots. */
    deepShare: 0.15,
    /** Yardage, not just accuracy, scales with the matchup. Without this a
     *  better passing offence completes more throws but gains the same on each
     *  one, which flattens the effect of team strength on the scoreboard and
     *  leaves home-field advantage barely measurable. */
    deepSharePerDiff: 0.0018,
    shortMeanPerDiff: 0.085,
    deepMeanYards: 31,
    deepSdYards: 12,
    /** Short completions: 1 + exponential(mean). */
    shortMeanYards: 7.6,

    /** Dropbacks that become scrambles rather than throws or sacks. */
    scrambleRate: 0.035,
    scrambleMeanYards: 6,

    sackMeanLoss: 5.5,
    sackMaxLoss: 18,

    /** Completions that go out of bounds and stop the clock. */
    outOfBoundsShare: 0.16,
  },

  run: {
    yardsPerCarryBase: 4.55,
    yardsPerCarryPerDiff: 0.058,
    yardsPerCarryMin: 2.5,
    yardsPerCarryMax: 6.4,

    /** Share of carries stopped at or behind the line. */
    stuffShareBase: 0.15,
    stuffSharePerDiff: -0.004,
    stuffMeanLoss: 1.4,
    stuffSdLoss: 1.6,

    breakawayShare: 0.033,
    breakawayMeanExtra: 19,

    fumbleRate: 0.0092,
    outOfBoundsShare: 0.11,
  },

  /** Play selection in a neutral situation, before down, score and clock
   *  adjustments. */
  playcall: {
    neutralRunShare: 0.445,
    /** Added to run share per point of lead, late in a game. */
    leadRunBias: 0.011,
    /** Third and long pushes hard toward the pass. */
    thirdAndLongPassBias: 0.34,
    shortYardageRunBias: 0.3,
    /** Inside two minutes, trailing: pass almost everything. */
    twoMinutePassShare: 0.86,
  },

  kicking: {
    /** Field goal probability is logistic in distance. */
    // Logistic midpoint and slope fitted to real make rates: ~98% inside 30
    // yards, ~93% at 35, ~80% at 45, ~55% at 55. The previous midpoint of 47
    // put a 40-yard attempt at 72%, which is a different sport.
    fieldGoalBaseDistance: 56,
    fieldGoalSlope: 0.126,
    /** Physical limit: beyond this the kick cannot reach. */
    fieldGoalMaxDistance: 63,
    /** Longest kick a coach will attempt in a normal situation. Separate from
     *  the physical limit so desperation can exceed it without making 60-yard
     *  attempts routine. */
    fieldGoalAttemptDistance: 55,
    fieldGoalWindPenalty: 0.012,
    extraPointDistance: 33,
    puntMeanYards: 46,
    puntSdYards: 7,
    touchbackShare: 0.62,
    kickoffTouchbackShare: 0.68,
    kickoffReturnMeanYards: 24,
  },

  clock: {
    quarterSeconds: 900,
    overtimeSeconds: 600,
    /** Snap-to-snap with the clock running. Tempo shortens it. */
    runningClockSeconds: 38,
    runningClockTempoSwing: 8,
    /** A play that stops the clock still consumes its own duration. */
    stoppedClockSeconds: 6,
    hurryUpSeconds: 17,
    /** Seconds left in a half at which the trailing team starts hurrying. */
    hurryUpThreshold: 120,
  },

  fatigue: {
    /** Snaps a player absorbs before fatigue begins, at stamina 0 and 99. */
    freshSnapsBase: 18,
    freshSnapsPerStamina: 0.42,
    /** Rating points lost per snap beyond the fresh window. */
    declinePerSnap: 0.22,
    maxPenalty: 12,
    /** Snaps of recovery credited while the unit is off the field. */
    recoveryPerPossession: 9,
  },

  injury: {
    /** Per-snap base probability for a player on the field. Tuned so a team
     *  loses roughly one player to injury per game, of which about half return
     *  the same day -- an in-game rate, not the season-long attrition the
     *  offseason model applies separately. */
    perSnapBase: 0.00062,
    /** Contact-heavy snaps carry more risk. */
    runPlayMultiplier: 1.35,
    sackMultiplier: 2.1,
    /** A tired player is likelier to get hurt. */
    fatigueMultiplier: 0.9,
    /** Durability 99 roughly halves the rate; durability 40 raises it. */
    durabilityPivot: 70,
    durabilitySlope: 0.011,
    severityWeights: {
      minor: 0.55,
      shortTerm: 0.27,
      majorTerm: 0.13,
      seasonEnding: 0.05,
    },
    shortTermWeeks: [1, 3] as const,
    majorTermWeeks: [4, 9] as const,
  },

  drive: {
    /** Touchback places the ball here, measured from the offense's goal line. */
    touchbackYardLine: 25,
    /** Fourth-down decision thresholds, before aggression adjustment. */
    fieldGoalMaxYardLine: 100,
    /** Modern fourth-down behaviour: past midfield and short, clubs go. Set
     *  conservatively enough that the punt rate lands in a real range without
     *  turning every drive into a gamble. */
    goForItYardLineFloor: 52,
    goForItMaxDistance: 4.5,
  },
} as const;

/** Clamp helper used throughout the rate formulas. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
