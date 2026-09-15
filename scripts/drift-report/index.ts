// Offseason population report.
//
//   node scripts/drift-report/index.ts [--seasons 40] [--seed N] [--out FILE]
//
// Runs the offseason loop for many seasons and answers two questions:
//
//   1. Does league-average ability stay flat? Ability moves only in the
//      offseason, so if it drifts the cause is development, retirement or
//      intake -- and per legacy/ENGINE.md, intake is the usual culprit.
//   2. Are ability, production and reputation actually decoupled? A game where
//      the best player always grades best has no scouting and no breakouts.
//
// No games are simulated. That is not a shortcut: game simulation does not move
// ratings, so the population loop reproduces the talent dynamics exactly and is
// what isolated the original drift bug.

import { writeFileSync } from 'node:fs';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  correlation,
  meanRosteredAbility,
  primePipeline,
  runOffseason,
  OFFSEASON,
  PEAK_AGE,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { FIRST_SEASON, loadCareerLeague } from './careerLeague.ts';
import { lineChart, slopePerStep } from './chart.ts';

interface Options {
  seasons: number; seed: number; runs: number; out: string | undefined;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { seasons: 40, seed: 20260907, runs: 5, out: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (next === undefined) continue;
    if (argv[i] === '--seasons') { options.seasons = Number(next); i += 1; }
    else if (argv[i] === '--seed') { options.seed = Number(next); i += 1; }
    else if (argv[i] === '--runs') { options.runs = Number(next); i += 1; }
    else if (argv[i] === '--out') { options.out = next; i += 1; }
  }
  return options;
}

const RULE = '-'.repeat(78);
const fmt = (v: number, dp = 2): string => (Number.isFinite(v) ? v.toFixed(dp) : '-');

// Folds rather than Math.min(...array): a long run collects well over a hundred
// thousand retirement ages, and spreading that into a call blows the stack.
// Discovered at 80 seasons, which is exactly the length this report exists to
// make safe to run.
const minOf = (xs: readonly number[]): number =>
  xs.reduce((a, b) => (b < a ? b : a), Infinity);
const maxOf = (xs: readonly number[]): number =>
  xs.reduce((a, b) => (b > a ? b : a), -Infinity);


interface RunResult {
  readonly series: number[];
  readonly abilities: number[];
  readonly grades: number[];
  readonly repAbilities: number[];
  readonly reputations: number[];
  readonly gradeThisYear: number[];
  readonly gradeNextYear: number[];
  readonly retirementAges: number[];
  readonly breakouts: number;
  readonly busts: number;
  readonly rows: string[];
}

/** One independent league, simulated for the requested number of seasons. */
function runLeague(seasons: number, seed: number): RunResult {
  const league = loadCareerLeague();
  const rng = createRng(seed);
  primePipeline(league, rng);

  const series = [meanRosteredAbility(league)];
  const abilities: number[] = [];
  const grades: number[] = [];
  const repAbilities: number[] = [];
  const reputations: number[] = [];
  const gradeThisYear: number[] = [];
  const gradeNextYear: number[] = [];
  const retirementAges: number[] = [];
  const rows: string[] = [];
  let breakouts = 0;
  let busts = 0;
  let previousGrades = new Map<string, number>();

  for (let i = 0; i < seasons; i += 1) {
    const { summary, grades: seasonGrades, retired } = runOffseason(league, rng);
    // Age here is the age the player would have entered the coming season at,
    // since development increments age just before retirement is decided.
    for (const player of retired) retirementAges.push(player.age);

    const thisYear = new Map<string, number>();
    for (const grade of seasonGrades) {
      // grade.ability is the rating held during the season graded. Reading it
      // off the player would give the post-development rating and quietly
      // measure the wrong year.
      abilities.push(grade.ability);
      grades.push(grade.grade);
      thisYear.set(grade.playerId, grade.grade);
      const prior = previousGrades.get(grade.playerId);
      if (prior !== undefined) {
        gradeThisYear.push(prior);
        gradeNextYear.push(grade.grade);
      }
    }
    previousGrades = thisYear;

    for (const player of league.players) {
      if (!player.retired && player.teamId !== null) {
        reputations.push(player.reputation);
        repAbilities.push(player.ability);
      }
    }

    breakouts += summary.breakouts;
    busts += summary.busts;
    series.push(summary.meanAbility);
    rows.push(
      `  ${String(summary.season).padStart(6)}` +
      `${fmt(summary.meanAbility).padStart(10)}` +
      `${fmt(summary.meanAge, 1).padStart(9)}` +
      `${String(summary.retired).padStart(10)}` +
      `${String(summary.drafted).padStart(9)}` +
      `${String(summary.breakouts).padStart(11)}` +
      `${String(summary.busts).padStart(7)}`,
    );
  }

  return {
    series, abilities, grades, repAbilities, reputations,
    gradeThisYear, gradeNextYear, retirementAges, breakouts, busts, rows,
  };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  // Independent leagues rather than one.
  //
  // League mean ability wanders from season to season, and that wandering is
  // autocorrelated -- this year's league is last year's minus retirements plus a
  // draft class. A least-squares slope fitted through a single 40-season run of
  // such a series has a wide sampling distribution: runs that end within half a
  // rating point of where they started still produce slopes of -0.04, which
  // reads as drift and is not. Averaging the slope over several independent
  // leagues is what separates a trend from a walk.
  const runs: RunResult[] = [];
  for (let r = 0; r < Math.max(1, options.runs); r += 1) {
    runs.push(runLeague(options.seasons, options.seed + r * 7919));
  }
  const first = runs[0] as RunResult;
  const startingAbility = first.series[0] as number;
  const seasonsPlusOne = first.series.length;

  // Mean trajectory across leagues, which is what gets charted.
  const meanAbility: number[] = [];
  for (let i = 0; i < seasonsPlusOne; i += 1) {
    let sum = 0;
    for (const run of runs) sum += run.series[i] as number;
    meanAbility.push(sum / runs.length);
  }

  // The transient runs longer than it looks: the mean peaks around season 8 and
  // is still returning through the mid-teens, so a 10-season burn-in leaves part
  // of the descent inside the window and reports it as drift.
  const burnin = Math.min(20, Math.floor(options.seasons / 3));
  const perRunSlope = runs.map((run) => slopePerStep(run.series.slice(burnin)));
  const perRunChange = runs.map(
    (run) => (run.series[run.series.length - 1] as number) - (run.series[0] as number),
  );
  const meanSlope = perRunSlope.reduce((a, b) => a + b, 0) / perRunSlope.length;
  const meanChange = perRunChange.reduce((a, b) => a + b, 0) / perRunChange.length;
  const slopeSpread = perRunSlope.length > 1
    ? Math.sqrt(perRunSlope.reduce((a, b) => a + (b - meanSlope) ** 2, 0) /
      (perRunSlope.length - 1)) / Math.sqrt(perRunSlope.length)
    : 0;

  const low = minOf(runs.flatMap((r) => r.series));
  const high = maxOf(runs.flatMap((r) => r.series));
  const peak = meanAbility.reduce(
    (best, v, i) => (Math.abs(v - startingAbility) > Math.abs(best.v - startingAbility)
      ? { v, i } : best),
    { v: startingAbility, i: 0 },
  );

  // Flat when the average trend across leagues is indistinguishable from zero
  // and no league went anywhere.
  const flat = Math.abs(meanSlope) < 0.02 &&
    Math.abs(meanChange) < 1.0 &&
    maxOf(perRunChange.map((c) => Math.abs(c))) < 1.5;

  const abilities = runs.flatMap((r) => r.abilities);
  const grades = runs.flatMap((r) => r.grades);
  const repAbilities = runs.flatMap((r) => r.repAbilities);
  const reputations = runs.flatMap((r) => r.reputations);
  const gradeThisYear = runs.flatMap((r) => r.gradeThisYear);
  const gradeNextYear = runs.flatMap((r) => r.gradeNextYear);
  const retirementAges = runs.flatMap((r) => r.retirementAges);
  const totalBreakouts = runs.reduce((a, r) => a + r.breakouts, 0);
  const totalBusts = runs.reduce((a, r) => a + r.busts, 0);
  const rows = first.rows;
  const slope = slopePerStep(meanAbility);
  const settledSlope = meanSlope;
  const total = meanChange;

  const sections = [
    'DYNASTY MANAGER PRO - OFFSEASON POPULATION REPORT',
    RULE,
    `  seasons            ${options.seasons}  (${FIRST_SEASON} to ${FIRST_SEASON + options.seasons - 1})`,
    `  independent runs   ${runs.length}`,
    `  base seed          ${options.seed}`,
    `  no games simulated - ability moves only in the offseason`,
    '',
    lineChart(meanAbility, {
      height: 17,
      label: `League mean ability of rostered players, averaged over ${runs.length} leagues`,
      reference: startingAbility,
      band: 1,
    }),
    '',
    `  dotted line = starting level ${fmt(startingAbility)};  dashes = +/- 1.00 rating point`,
    '',
    'DRIFT',
    RULE,
    `  starting mean          ${fmt(startingAbility)}`,
    `  ending mean            ${fmt(meanAbility[meanAbility.length - 1] as number)}`,
    `  mean total change      ${total >= 0 ? '+' : ''}${fmt(total)} over ${options.seasons} seasons`,
    `  per-league change      ${perRunChange.map((c) => (c >= 0 ? '+' : '') + c.toFixed(2)).join(', ')}`,
    `  slope, mean trajectory ${slope >= 0 ? '+' : ''}${fmt(slope, 4)} rating points per season`,
    `  slope, per league      ${settledSlope >= 0 ? '+' : ''}${fmt(settledSlope, 4)} ` +
      `+/- ${fmt(slopeSpread, 4)} (mean of ${runs.length}, first ${burnin} seasons excluded)`,
    `  range across leagues   ${fmt(low)} to ${fmt(high)}  (spread ${fmt(high - low)})`,
    `  settling transient     peaks ${peak.v >= startingAbility ? '+' : ''}` +
      `${fmt(peak.v - startingAbility)} at season ${peak.i}, then returns`,
    `  verdict                ${flat ? 'FLAT - intake is calibrated' : 'DRIFTING - draft intake is miscalibrated'}`,
  ];

  if (!flat) {
    sections.push(
      '',
      '  The intake constants are the lever, in scripts order of effect:',
      `    intake.classAbilityMean   currently ${OFFSEASON.intake.classAbilityMean}`,
      `    intake.potentialScale     currently ${OFFSEASON.intake.potentialScale}`,
      `    intake.classSize          currently ${OFFSEASON.intake.classSize}`,
      '  Raise the class mean if the league is sinking, lower it if the league is',
      '  inflating. legacy/ENGINE.md records that every setting converges; they',
      '  converge to different levels, so this is a level problem, not a stability one.',
    );
  }

  sections.push(
    '',
    'ABILITY, PRODUCTION AND REPUTATION',
    RULE,
    '  These must not be the same number. A league where the best player always',
    '  grades best has no scouting, no breakouts and no arguments.',
    '',
    `  ability to season grade      ${fmt(correlation(abilities, grades), 3)}   target ~0.55`,
    `  ability to reputation        ${fmt(correlation(repAbilities, reputations), 3)}   high, but lagging`,
    `  grade to next season grade   ${fmt(correlation(gradeThisYear, gradeNextYear), 3)}   partly repeatable`,
    '',
    'DEVELOPMENT',
    RULE,
    `  breakout seasons       ${fmt(totalBreakouts / runs.length / options.seasons, 1)} per season`,
    `  bust seasons           ${fmt(totalBusts / runs.length / options.seasons, 1)} per season`,
    `  retirements            ${fmt(retirementAges.length / runs.length / options.seasons, 1)} per season`,
    `  mean retirement age    ${fmt(retirementAges.reduce((a, b) => a + b, 0) / Math.max(1, retirementAges.length), 1)}`,
    `  retirement age range   ${minOf(retirementAges)} to ${maxOf(retirementAges)}`,
    '',
    `PER SEASON (first league, seed ${options.seed})`,
    RULE,
    '  season      mean      age   retired  drafted  breakouts  busts',
    ...rows,
    '',
    `  peak ages by group: ${Object.entries(PEAK_AGE).map(([g, a]) => `${g} ${a}`).join(', ')}`,
    '',
  );

  const text = sections.join('\n');
  process.stdout.write(text + '\n');
  if (options.out !== undefined) {
    writeFileSync(options.out, text + '\n', 'utf8');
    process.stderr.write(`  written to ${options.out}\n`);
  }
  process.exitCode = flat ? 0 : 1;
}

main();
