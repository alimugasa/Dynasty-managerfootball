// TARGET RANGES — this is the file to edit.
//
// Every range below is a placeholder standing in until real ones are supplied.
// They are drawn from real-world professional football and are deliberately
// generous; treat a green result here as "not obviously wrong", not as
// "calibrated". Replace them wholesale, or override any subset at run time:
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
    low: 20.5, high: 25.5, unit: 'pts',
    tuning: [
      'run.yardsPerCarryBase and pass.shortMeanYards — raise both to move drives further',
      'kicking.fieldGoalBaseDistance — the logistic midpoint; raising it makes kicks easier',
      'drive.goForItYardLineFloor — going for it more converts punts into scores and turnovers',
    ],
  },
  'points.sd': {
    label: 'Points per team per game (spread)',
    low: 8.5, high: 11.5, unit: 'pts',
    tuning: [
      'pass.deepShare and pass.deepSdYards — deep shots are most of the tail',
      'run.breakawayShare and run.breakawayMeanExtra',
    ],
  },
  'points.p95': {
    label: 'Points per team per game (95th percentile)',
    low: 36, high: 44, unit: 'pts',
    tuning: ['pass.deepShare', 'run.breakawayMeanExtra'],
  },
  'points.max': {
    label: 'Highest team score in any game',
    low: 55, high: 80, unit: 'pts',
    tuning: ['pass.deepMeanYards', 'run.breakawayMeanExtra'],
  },
  'shutouts.share': {
    label: 'Share of team-games held scoreless',
    low: 0.005, high: 0.035, unit: 'share',
    tuning: ['pass.completionBase — lowering it produces more stalled offences'],
  },

  // ---------------------------------------------------------------- yardage
  'yards.mean': {
    label: 'Total yards per team per game (mean)',
    low: 310, high: 370, unit: 'yds',
    tuning: [
      'pass.shortMeanYards — the dominant lever on total offence',
      'run.yardsPerCarryBase',
      'clock.runningClockSeconds — fewer seconds per snap means more snaps and more yards',
    ],
  },
  'yards.sd': {
    label: 'Total yards per team per game (spread)',
    low: 70, high: 100, unit: 'yds',
    tuning: ['pass.deepSdYards', 'pass.deepShare'],
  },
  'yards.p05': {
    label: 'Total yards per team per game (5th percentile)',
    low: 165, high: 235, unit: 'yds',
    tuning: ['pass.completionMin and pass.sackRateMax — the floor on a bad day'],
  },
  'yards.p95': {
    label: 'Total yards per team per game (95th percentile)',
    low: 450, high: 520, unit: 'yds',
    tuning: ['pass.deepShare', 'pass.deepMeanYards'],
  },

  // ---------------------------------------------------------------- balance
  'split.passYardShare': {
    label: 'Passing share of total yards',
    low: 0.6, high: 0.7, unit: 'share',
    tuning: [
      'playcall.neutralRunShare — the single lever on run/pass balance',
      'pass.shortMeanYards versus run.yardsPerCarryBase',
    ],
  },
  'split.passPlayShare': {
    label: 'Pass attempts as a share of attempts plus carries',
    low: 0.53, high: 0.62, unit: 'share',
    tuning: [
      'playcall.neutralRunShare',
      'playcall.thirdAndLongPassBias and playcall.leadRunBias',
    ],
  },
  'split.rushAttempts': {
    label: 'Rushing attempts per team per game',
    low: 23, high: 30, unit: 'att',
    tuning: ['playcall.neutralRunShare', 'clock.runningClockSeconds'],
  },

  // ------------------------------------------------- competitive spread
  // These measure how far apart the best and worst offences finish. A league
  // whose average is right can still be wrong here, and when it is, every
  // top-end leader figure inherits the error. Check these before concluding a
  // leader total is too high.
  'spread.passYardsRatio': {
    label: 'Passing yards, best club over worst club',
    low: 1.45, high: 1.9, unit: 'x',
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
    low: 0.05, high: 0.14, unit: 'share',
    tuning: ['pass.completionPerDiff', 'run.yardsPerCarryPerDiff'],
  },
  'wins.perfectShare': {
    label: 'Share of team-seasons unbeaten',
    low: 0, high: 0.004, unit: 'share',
    tuning: ['Reduce pass.completionPerDiff if unbeaten seasons are common'],
  },
  'wins.winlessShare': {
    label: 'Share of team-seasons without a win',
    low: 0, high: 0.006, unit: 'share',
    tuning: ['Reduce pass.completionPerDiff if winless seasons are common'],
  },
  'homeWin.share': {
    label: 'Home win percentage',
    low: 0.53, high: 0.59, unit: 'share',
    tuning: ['homeField.passDiff and homeField.runDiff', 'homeField.awayFalseStartRate'],
  },

  // ---------------------------------------------------------------- injuries
  'injury.perTeamGame': {
    label: 'Injuries per team per game',
    low: 0.4, high: 1.6, unit: 'inj',
    tuning: ['injury.perSnapBase', 'injury.durabilitySlope', 'injury.fatigueMultiplier'],
  },
  'injury.gamesLostPerTeamSeason': {
    label: 'Player-games lost to injury per team per season',
    low: 25, high: 90, unit: 'games',
    tuning: [
      'injury.severityWeights — shifts the balance between knocks and long absences',
      'injury.majorTermWeeks and injury.shortTermWeeks',
    ],
  },
  'injury.seasonEndingPerTeamSeason': {
    label: 'Season-ending injuries per team per season',
    low: 1.0, high: 5.0, unit: 'inj',
    tuning: ['injury.severityWeights.seasonEnding', 'injury.perSnapBase'],
  },

  // ---------------------------------------------------------------- top end
  'leader.passYards': {
    label: 'Season passing yards, league leader',
    low: 4500, high: 5600, unit: 'yds',
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
    low: 1450, high: 2000, unit: 'yds',
    tuning: ['The target shares in chooseReceiver (plays.ts)', 'pass.deepShare'],
  },
  'leader.passTds': {
    label: 'Season passing touchdowns, league leader',
    low: 35, high: 55, unit: 'td',
    tuning: ['pass.shortMeanYards near the goal line', 'playcall run share inside the ten'],
  },
  'leader.sacks': {
    label: 'Season sacks, league leader',
    low: 15, high: 24, unit: 'sacks',
    tuning: [
      'pass.sackRateBase',
      'The defender weighting in chooseDefender (plays.ts) — flat weights spread sacks too evenly',
    ],
  },
  'record.gamePassYards': {
    label: 'Most passing yards by one player in a game',
    low: 450, high: 580, unit: 'yds',
    tuning: ['pass.deepSdYards', 'pass.deepShare'],
  },
  'record.gameRushYards': {
    label: 'Most rushing yards by one player in a game',
    low: 230, high: 320, unit: 'yds',
    tuning: ['run.breakawayMeanExtra', 'run.breakawayShare'],
  },
};

export type TargetKey = keyof typeof TARGETS;
