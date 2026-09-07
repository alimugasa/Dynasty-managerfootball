// Intake calibration sweep.
//
//   node scripts/drift-report/sweep.ts [--seasons 60] [--burnin 25]
//
// legacy/ENGINE.md records the finding this exists to reproduce: talent drift is
// not instability. Every parameter setting converges; they converge to different
// levels. So the question is never "is it stable" but "what level does this
// intake imply", and the answer is found by running each setting to equilibrium
// and reading it off.
//
// Reports, for each setting, the level the league settles at and the residual
// slope once it has settled. The right setting is the one whose equilibrium
// matches the level the seed database already sits at, because that
// distribution is the one anchored to real football.

import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  meanRosteredAbility, OFFSEASON, primePipeline, runOffseason, NEUTRAL_CONTEXT,
  type IntakeConfig,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { loadCareerLeague } from './careerLeague.ts';
import { slopePerStep } from './chart.ts';

interface Options {
  seasons: number; burnin: number; seeds: number;
  means: number[]; scales: number[];
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    seasons: 60, burnin: 25, seeds: 2,
    means: [57.8, 59, 60, 61, 62, 63], scales: [6.15, 7.0],
  };
  const list = (v: string): number[] => v.split(',').map(Number).filter(Number.isFinite);
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (next === undefined) continue;
    if (argv[i] === '--seasons') { options.seasons = Number(next); i += 1; }
    else if (argv[i] === '--burnin') { options.burnin = Number(next); i += 1; }
    else if (argv[i] === '--seeds') { options.seeds = Number(next); i += 1; }
    else if (argv[i] === '--means') { options.means = list(next); i += 1; }
    else if (argv[i] === '--scales') { options.scales = list(next); i += 1; }
  }
  return options;
}

interface Outcome { equilibrium: number; slope: number }

function runSetting(intake: IntakeConfig, seasons: number, burnin: number, seed: number): Outcome {
  const league = loadCareerLeague();
  const rng = createRng(seed);
  primePipeline(league, rng, intake);
  const series: number[] = [];
  for (let i = 0; i < seasons; i += 1) {
    runOffseason(league, rng, NEUTRAL_CONTEXT, intake);
    series.push(meanRosteredAbility(league));
  }
  const settled = series.slice(burnin);
  const equilibrium = settled.reduce((a, b) => a + b, 0) / settled.length;
  return { equilibrium, slope: slopePerStep(settled) };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const baseline = loadCareerLeague();
  const target = meanRosteredAbility(baseline);

  process.stdout.write(
    'INTAKE CALIBRATION SWEEP\n' + '-'.repeat(78) + '\n' +
    `  target level      ${target.toFixed(2)}  (the seed database's own mean)\n` +
    `  seasons           ${options.seasons}, discarding ${options.burnin} as burn-in\n` +
    `  seeds             ${options.seeds}\n\n` +
    '  class mean  potential scale   equilibrium    residual slope   gap to target\n',
  );

  const classMeans = options.means;
  const scales = options.scales;
  const results: { mean: number; scale: number; eq: number; slope: number }[] = [];

  for (const scale of scales) {
    for (const classMean of classMeans) {
      const intake: IntakeConfig = {
        ...OFFSEASON.intake, classAbilityMean: classMean, potentialScale: scale,
      };
      let eq = 0;
      let slope = 0;
      for (let s = 0; s < options.seeds; s += 1) {
        const outcome = runSetting(intake, options.seasons, options.burnin, 1000 + s * 7919);
        eq += outcome.equilibrium;
        slope += outcome.slope;
      }
      eq /= options.seeds;
      slope /= options.seeds;
      results.push({ mean: classMean, scale, eq, slope });
      const gap = eq - target;
      process.stdout.write(
        `  ${classMean.toFixed(1).padStart(10)}` +
        `${scale.toFixed(2).padStart(17)}` +
        `${eq.toFixed(2).padStart(14)}` +
        `${(slope >= 0 ? '+' : '') + slope.toFixed(4)}`.padStart(18) +
        `${(gap >= 0 ? '+' : '') + gap.toFixed(2)}`.padStart(16) + '\n',
      );
    }
  }

  const best = results.reduce((a, b) =>
    Math.abs(b.eq - target) < Math.abs(a.eq - target) ? b : a);
  process.stdout.write(
    '\n' + '-'.repeat(78) + '\n' +
    `  closest setting: classAbilityMean ${best.mean}, potentialScale ${best.scale}\n` +
    `  equilibrium ${best.eq.toFixed(2)} against a target of ${target.toFixed(2)} ` +
    `(gap ${(best.eq - target >= 0 ? '+' : '') + (best.eq - target).toFixed(2)})\n` +
    '  Nothing has been changed. Update OFFSEASON.intake to adopt it.\n',
  );
}

main();
