// TARGET RANGES
//
// These are the ranges the project calibrates against. They are drawn from
// real-world professional football over roughly the last ten seasons, taking the
// span the real game actually moved through rather than a single year, so a
// result inside a range is plausible football and not a match to one season.
//
// They are deliberately tighter than a first pass would be. A range wide enough
// that everything fits reports nothing; the injury ranges in particular were
// loose enough to let a real defect read as marginal, and have been set to what
// the real game does.
//
// Two rules were applied when choosing them:
//   - Gate on stable statistics. A single extreme observation over half a
//     million team-games is mostly noise, so the scoring tail is checked at the
//     99th percentile rather than at the maximum. Maxima are still printed, as
//     information rather than as a test.
//   - Prefer a range the real game has actually occupied to a range centred on
//     what the engine currently produces.
//
// Override any subset at run time rather than editing the file:
//
//   node scripts/sim-report/index.ts --targets my-ranges.json
//
// where the JSON is { "<metric key>": { "low": <number>, "high": <number> } }.
//
// `tuning` names the constants in supabase/functions/_shared/engine/calibration.ts
// that move each metric, and which way. Nothing here changes the engine: the
// report only reads.

export interface Target {
  readonly label: string;
  readonly low: number;
  readonly high: number;
  readonly unit: string;
  /** Constants that move this metric, most direct lever first. */
  readonly tuning: readonly string[];
}

export const TARGETS: Readonly<Record<string, Target>> = {
  // ---------------------------------------------------------------- scoring
  'points.mean': {
    label: 'Points per team per game (mean)',
    low: 20.5, high: 24.0, unit: 'pts',
    tuning: [
      'run.yardsPerCarryBase and pass.shortMeanYards — raise both to move drives further',
      'kicking.fieldGoalBaseDistance — the logistic midpoint; raising it makes kicks easier',
      'drive.goForItYardLineFloor — going for it more converts punts into scores and turnovers',
    ],
  },
  'points.sd': {
    label: 'Points per team per game (spread)',
    low: 9.0, high: 11.5, unit: 'pts',
    tuning: [
      'pass.deepShare and pass.deepSdYards — deep shots are most of the tail',
      'run.breakawayShare and run.breakawayMeanExtra',
    ],
  },
  'points.p95': {
    label: 'Points per team per game (95th percentile)',
    low: 34, high: 40, unit: 'pts',
    tuning: ['pass.deepShare', 'run.breakawayMeanExtra'],
  },
  // Was the single highest score in the whole sample. Over half a million
  // team-games that is one observation from the far tail, so it moved with the
  // seed rather than with the engine. The 99th percentile measures the same
  // scoring tail and is stable enough to gate on.
  'points.p99': {
    label: 'Points per team per game (99th percentile)',
    low: 41, high: 48, unit: 'pts',
    tuning: ['pass.deepShare and pass.deepMeanYards', 'run.breakawayMeanExtra'],
  },
  'shutouts.share': {
    label: 'Share of team-games held scoreless',
    low: 0.004, high: 0.025, unit: 'share',
    tuning: ['pass.completionBase — lowering it produces more stalled offences'],
  },

  // ---------------------------------------------------------------- yardage
  'yards.mean': {
    label: 'Total yards per team per game (mean)',
    low: 325, high: 360, unit: 'yds',
    tuning: [
      'pass.shortMeanYards — the dominant lever on total offence',
      'run.yardsPerCarryBase',
      'clock.runningClockSeconds — fewer seconds per snap means more snaps and more yards',
    ],
  },
  'yards.sd': {
    label: 'Total yards per team per game (spread)',
    low: 75, high: 100, unit: 'yds',
    tuning: ['pass.deepSdYards', 'pass.deepShare'],
  },
  'yards.p05': {
    label: 'Total yards per team per game (5th percentile)',
    low: 180, high: 225, unit: 'yds',
    tuning: ['pass.completionMin and pass.sackRateMax — the floor on a bad day'],
  },
  'yards.p95': {
    label: 'Total yards per team per game (95th percentile)',
    low: 465, high: 520, unit: 'yds',
    tuning: ['pass.deepShare', 'pass.deepMeanYards'],
  },

  // ---------------------------------------------------------------- balance
  'split.passYardShare': {
    label: 'Passing share of total yards',
    low: 0.62, high: 0.69, unit: 'share',
    tuning: [
      'playcall.neutralRunShare — the single lever on run/pass balance',
      'pass.shortMeanYards versus run.yardsPerCarryBase',
    ],
  },
  'split.passPlayShare': {
    label: 'Pass attempts as a share of attempts plus carries',
    low: 0.53, high: 0.58, unit: 'share',
    tuning: [
      'playcall.neutralRunShare',
      'playcall.thirdAndLongPassBias and playcall.leadRunBias',
    ],
  },
  'split.rushAttempts': {
    label: 'Rushing attempts per team per game',
    low: 24.5, high: 29.5, unit: 'att',
    tuning: ['playcall.neutralRunShare', 'clock.runningClockSeconds'],
  },

  // ------------------------------------------------- competitive spread
  // These measure how far apart the best and worst offences finish. A league
  // whose average is right can still be wrong here, and when it is, every
  // top-end leader figure inherits the error. Check these before concluding a
  // leader total is too high.
  'spread.passYardsRatio': {
    label: 'Passing yards, best club over worst club',
    low: 1.5, high: 1.95, unit: 'x',
    tuning: [
      'pass.shortMeanPerDiff — yards per completion per rating point; the steepest lever',
      'pass.completionPerDiff — accuracy per rating point',
      'pass.deepSharePerDiff',
      'These three compound: more completions multiplied by more yards on each.',
    ],
  },
  'spread.totalYardsRatio': {
    label: 'Total yards, best club over worst club',
    low: 1.3, high: 1.65, unit: 'x',
    tuning: [
      'pass.shortMeanPerDiff and pass.completionPerDiff',
      'run.yardsPerCarryPerDiff',
    ],
  },

  // ---------------------------------------------------------------- standings
  'wins.sd': {
    label: 'Win totals across a season (spread)',
    low: 2.6, high: 3.4, unit: 'wins',
    tuning: [
      'pass.completionPerDiff and pass.shortMeanPerDiff — how hard team strength bites',
      'run.yardsPerCarryPerDiff',
      'A spread that is too tight means talent is not translating into results.',
    ],
  },
  'wins.eliteShare': {
    label: 'Share of team-seasons winning 13 or more',
    low: 0.06, high: 0.15, unit: 'share',
    tuning: ['pass.completionPerDiff', 'pass.shortMeanPerDiff'],
  },
  'wins.poorShare': {
    label: 'Share of team-seasons winning 3 or fewer',
    low: 0.04, high: 0.13, unit: 'share',
    tuning: ['pass.completionPerDiff', 'run.yardsPerCarryPerDiff'],
  },
  'wins.perfectShare': {
    // An unbeaten season across a full schedule has happened once in the real
    // game's modern history, and never over a 17-game schedule. Roughly one
    // team-season in two thousand.
    label: 'Share of team-seasons unbeaten',
    low: 0, high: 0.0015, unit: 'share',
    tuning: ['Reduce pass.completionPerDiff if unbeaten seasons are common'],
  },
  'wins.winlessShare': {
    label: 'Share of team-seasons without a win',
    low: 0, high: 0.0025, unit: 'share',
    tuning: ['Reduce pass.completionPerDiff if winless seasons are common'],
  },
  'homeWin.share': {
    label: 'Home win percentage',
    low: 0.52, high: 0.58, unit: 'share',
    tuning: ['homeField.passDiff and homeField.runDiff', 'homeField.awayFalseStartRate'],
  },

  // ---------------------------------------------------------------- injuries
  'injury.perTeamGame': {
    label: 'Injuries per team per game',
    low: 0.8, high: 2.2, unit: 'inj',
    tuning: ['injury.perSnapBase', 'injury.durabilitySlope', 'injury.fatigueMultiplier'],
  },
  'injury.gamesLostPerTeamSeason': {
    // Real clubs lose a striking amount of availability: starters miss weeks,
    // and the count includes every player unavailable for every week he is out.
    label: 'Player-games lost to injury per team per season',
    low: 60, high: 140, unit: 'games',
    tuning: [
      'injury.severityWeights — shifts the balance between knocks and long absences',
      'injury.majorTermWeeks and injury.shortTermWeeks',
    ],
  },
  'injury.seasonEndingPerTeamSeason': {
    // A real club puts something like eight to twelve players on season-ending
    // reserve across a year. The previous 1-5 range was low enough that an
    // engine producing under one still only read as marginally short.
    label: 'Season-ending injuries per team per season',
    low: 5.0, high: 12.0, unit: 'inj',
    tuning: ['injury.severityWeights.seasonEnding', 'injury.perSnapBase'],
  },

  // ---------------------------------------------------------------- top end
  'leader.passYards': {
    label: 'Season passing yards, league leader',
    low: 4700, high: 5500, unit: 'yds',
    tuning: [
      'CHECK spread.passYardsRatio FIRST. The leader plays for the best passing club,',
      'so this figure is downstream of how far the best club sits above the average.',
      'If the league mean (yards.mean, split.passYardShare) is in range, do NOT touch',
      'pass.shortMeanYards or pass.deepShare — that moves the whole league and breaks',
      'a metric that is already correct. Narrow pass.shortMeanPerDiff and',
      'pass.completionPerDiff instead.',
      'Only if the league mean is ALSO high: pass.shortMeanYards, pass.deepShare.',
    ],
  },
  'leader.rushYards': {
    label: 'Season rushing yards, league leader',
    low: 1550, high: 2150, unit: 'yds',
    tuning: [
      'run.yardsPerCarryBase and run.breakawayShare',
      'The share of carries going to the lead back, in chooseRusher (plays.ts)',
    ],
  },
  'leader.recYards': {
    label: 'Season receiving yards, league leader',
    low: 1500, high: 1975, unit: 'yds',
    tuning: ['The target shares in chooseReceiver (plays.ts)', 'pass.deepShare'],
  },
  'leader.passTds': {
    label: 'Season passing touchdowns, league leader',
    low: 35, high: 55, unit: 'td',
    tuning: ['pass.shortMeanYards near the goal line', 'playcall run share inside the ten'],
  },
  'leader.sacks': {
    label: 'Season sacks, league leader',
    low: 15, high: 23, unit: 'sacks',
    tuning: [
      'pass.sackRateBase',
      'The defender weighting in chooseDefender (plays.ts) — flat weights spread sacks too evenly',
    ],
  },
  'record.gamePassYards': {
    label: 'Most passing yards by one player in a game',
    low: 430, high: 540, unit: 'yds',
    tuning: ['pass.deepSdYards', 'pass.deepShare'],
  },
  'record.gameRushYards': {
    label: 'Most rushing yards by one player in a game',
    low: 220, high: 300, unit: 'yds',
    tuning: ['run.breakawayMeanExtra', 'run.breakawayShare'],
  },
};

export type TargetKey = keyof typeof TARGETS;
