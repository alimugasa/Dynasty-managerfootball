// Draft and free agency report.
//
//   node scripts/market-report/index.ts [--seasons 20] [--runs 3] [--seed N]
//
// Answers three questions the subsystems exist to make true:
//
//   Is the scouting fog honest? A band that does not contain the truth at its
//   stated rate is decoration, not information.
//   Do clubs miss? A draft where every club takes the best player available and
//   a market where the top bidder always wins are both solved problems.
//   Does the money make sense? Overpayment should be common and extreme
//   overpayment rare.

import { writeFileSync } from 'node:fs';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  addressedNeed, addressedTopNeed, capRules, generateClass, primePipeline, runOffseason,
  scoutClass, scoutingSigma, SCOUTING,
  type DraftPick, type FaPersonality, type Signing, type TeamFront,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { loadCareerLeague } from '../drift-report/careerLeague.ts';
import { POSITION_GROUPS } from '../../supabase/functions/_shared/engine/types.ts';

interface Options { seasons: number; runs: number; seed: number; out: string | undefined }

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { seasons: 20, runs: 3, seed: 20260907, out: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (next === undefined) continue;
    if (argv[i] === '--seasons') { options.seasons = Number(next); i += 1; }
    else if (argv[i] === '--runs') { options.runs = Number(next); i += 1; }
    else if (argv[i] === '--seed') { options.seed = Number(next); i += 1; }
    else if (argv[i] === '--out') { options.out = next; i += 1; }
  }
  return options;
}

const RULE = '-'.repeat(78);
const fmt = (v: number, dp = 2): string => (Number.isFinite(v) ? v.toFixed(dp) : '-');
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
const money = (v: number): string => `${(v / 1e6).toFixed(1)}M`;
const mean = (xs: readonly number[]): number =>
  (xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length);

function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx] as number;
}

/**
 * Fog calibration, measured on a whole class rather than on the players clubs
 * chose.
 *
 * Measuring coverage on picks alone would be measuring the winner's curse: a
 * club drafts the prospects it overestimates, so its bands look biased on the
 * selected sample even when the model is perfectly honest. Both numbers are
 * reported, separately, because the gap between them is itself the finding.
 */
function fogCalibration(seed: number): string[] {
  const rng = createRng(seed);
  const league = loadCareerLeague();
  const prospects = generateClass(rng, 2027);
  const lines: string[] = [];

  const buckets: { label: string; front: TeamFront }[] = [
    { label: 'weak dept, low spend', front: { id: 'A', scouting: 25, spending: 40, winNow: 0.5, prestige: 55, recentWinRate: 0.5, scoutingSpend: 0.6 } },
    { label: 'weak dept, high spend', front: { id: 'B', scouting: 25, spending: 40, winNow: 0.5, prestige: 55, recentWinRate: 0.5, scoutingSpend: 1.4 } },
    { label: 'elite dept, low spend', front: { id: 'C', scouting: 95, spending: 40, winNow: 0.5, prestige: 55, recentWinRate: 0.5, scoutingSpend: 0.6 } },
    { label: 'elite dept, high spend', front: { id: 'D', scouting: 95, spending: 40, winNow: 0.5, prestige: 55, recentWinRate: 0.5, scoutingSpend: 1.4 } },
  ];

  const neutralNeeds = Object.fromEntries(POSITION_GROUPS.map((g) => [g, 0.5])) as
    Record<(typeof POSITION_GROUPS)[number], number>;

  lines.push('  ' + 'club profile'.padEnd(24) + 'band width'.padStart(12) +
    'mean error'.padStart(12) + 'truth in band'.padStart(15));
  for (const { label, front } of buckets) {
    const reports = scoutClass(prospects, front, neutralNeeds, rng);
    const widths: number[] = [];
    const errors: number[] = [];
    let inside = 0;
    for (const prospect of prospects) {
      const report = reports.get(prospect.id);
      if (report === undefined) continue;
      widths.push(report.high - report.low);
      errors.push(Math.abs(report.estimate - prospect.ability));
      if (prospect.ability >= report.low && prospect.ability <= report.high) inside += 1;
    }
    lines.push(
      '  ' + label.padEnd(24) +
      fmt(mean(widths), 1).padStart(12) +
      fmt(mean(errors), 2).padStart(12) +
      pct(inside / prospects.length).padStart(15),
    );
  }
  lines.push('');
  lines.push(`  Bands are ${(SCOUTING.bandZ === 1.2816 ? '80%' : 'nominal')} intervals, so "truth in band" should read close to that.`);
  lines.push(`  Sigma runs from ${fmt(scoutingSigma(buckets[3]!.front, 2.5), 1)} (best case) to ` +
    `${fmt(scoutingSigma(buckets[0]!.front, 0), 1)} (worst).`);
  void league;
  return lines;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const picks: DraftPick[] = [];
  const signings: Signing[] = [];
  let seasons = 0;
  let capCuts = 0;

  for (let r = 0; r < options.runs; r += 1) {
    const league = loadCareerLeague();
    const rng = createRng(options.seed + r * 7919);
    primePipeline(league, rng);
    for (let i = 0; i < options.seasons; i += 1) {
      const result = runOffseason(league, rng);
      picks.push(...result.draft.picks);
      signings.push(...result.freeAgency.signings);
      seasons += 1;
    }
    const rules = capRules(league.season);
    for (const teamId of league.teamIds) {
      const roster = league.players.filter((p) => p.teamId === teamId);
      const committed = roster.reduce((a, p) => a + (p.contract?.aav ?? 0), 0);
      if (committed > rules.salaryCap) capCuts += 1;
    }
  }

  const firstRound = picks.filter((p) => p.round === 1);
  const estimateError = picks.map((p) => p.estimate - p.trueAbility);
  const reaches = picks.map((p) => p.reach);
  const needShare = picks.filter((p) => addressedNeed(p)).length / Math.max(picks.length, 1);
  const premiums = signings.map((s) => s.premium);

  const byPersonality = new Map<FaPersonality, Signing[]>();
  for (const signing of signings) {
    const list = byPersonality.get(signing.personality) ?? [];
    list.push(signing);
    byPersonality.set(signing.personality, list);
  }

  const sections: string[] = [
    'DYNASTY MANAGER PRO - DRAFT AND MARKET REPORT',
    RULE,
    `  seasons            ${seasons} (${options.runs} leagues x ${options.seasons})`,
    `  base seed          ${options.seed}`,
    `  draft picks        ${picks.length.toLocaleString()}`,
    `  free agent deals   ${signings.length.toLocaleString()}`,
    '',
    'SCOUTING FOG',
    RULE,
    ...fogCalibration(options.seed),
    '',
    'THE DRAFT',
    RULE,
    `  picks per season             ${fmt(picks.length / seasons, 1)}`,
    `  mean estimate error          ${fmt(mean(estimateError.map(Math.abs)), 2)} rating points`,
    `  estimate bias on picks       ${fmt(mean(estimateError), 2)}  (the winner's curse: clubs draft`,
    '                                     the prospects they overrate)',
    `  reaches (picked above rank)  ${pct(reaches.filter((r) => r > 0).length / Math.max(reaches.length, 1))}`,
    `  median reach                 ${fmt(quantile(reaches, 0.5), 0)} places`,
    `  biggest reach / steal        ${fmt(quantile(reaches, 0.99), 0)} / ${fmt(quantile(reaches, 0.01), 0)}`,
    `  picks at a real hole         ${pct(needShare)}  (need >= 0.35 at that position)`,
    `  picks at a top-3 need        ${pct(picks.filter((p) => addressedTopNeed(p)).length / Math.max(picks.length, 1))}`,
    `  first round, top-3 need      ${pct(firstRound.filter((p) => addressedTopNeed(p)).length / Math.max(firstRound.length, 1))}`,
    `  first round, biggest need    ${pct(firstRound.filter((p) => p.needRank === 1).length / Math.max(firstRound.length, 1))}`,
    `  mean need rank of pick       ${fmt(mean(picks.map((p) => p.needRank)), 1)} of 12  (6.5 would be random)`,
    '',
    '  A club that always addressed its biggest need would read 100% here, and',
    '  would be trivially predictable. A club that never did would be ignoring',
    '  its roster. Both are worse than a club that mostly does and sometimes',
    '  takes the player it rates instead.',
    '',
    'FREE AGENCY',
    RULE,
    `  signings per season          ${fmt(signings.length / seasons, 1)}`,
    `  mean bids per signed player  ${fmt(mean(signings.map((s) => s.bids)), 1)}`,
    `  top bidder lost              ${pct(signings.filter((s) => s.outbidByAnother).length / Math.max(signings.length, 1))}`,
    `  mean premium over market     ${fmt(mean(premiums), 2)}x`,
    `  median premium               ${fmt(quantile(premiums, 0.5), 2)}x`,
    `  overpaid by 25% or more      ${pct(premiums.filter((p) => p >= 1.25).length / Math.max(premiums.length, 1))}`,
    `  overpaid by 50% or more      ${pct(premiums.filter((p) => p >= 1.5).length / Math.max(premiums.length, 1))}`,
    `  signed below market          ${pct(premiums.filter((p) => p < 1).length / Math.max(premiums.length, 1))}`,
    `  mean deal                    ${money(mean(signings.map((s) => s.aav)))} x ${fmt(mean(signings.map((s) => s.years)), 1)} years`,
    '',
    '  premium by personality       (what each type actually ends up paid)',
    ...[...byPersonality.entries()]
      .sort((a, b) => mean(b[1].map((s) => s.premium)) - mean(a[1].map((s) => s.premium)))
      .map(([personality, list]) =>
        `    ${personality.padEnd(22)}${fmt(mean(list.map((s) => s.premium)), 2)}x` +
        `   ${money(mean(list.map((s) => s.aav))).padStart(8)}   n=${list.length}`),
    '',
    '  A money-first player should land the largest cheque and a ring-first one',
    '  should not, because he took less to go somewhere better.',
    '',
    'CAP',
    RULE,
    `  clubs over the cap at season end   ${capCuts} of ${options.runs * 32}`,
    `  cap in final season                ${money(capRules(2026 + options.seasons).salaryCap)}`,
    '',
  ];

  const text = sections.join('\n');
  process.stdout.write(text + '\n');
  if (options.out !== undefined) {
    writeFileSync(options.out, text + '\n', 'utf8');
    process.stderr.write(`  written to ${options.out}\n`);
  }
}

main();
