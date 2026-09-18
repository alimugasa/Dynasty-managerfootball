// Weekly news feed report.
//
//   node scripts/news-report/index.ts [--seasons 5] [--seed N] [--print 3] [--out FILE]
//
// The request the feed has to satisfy is "template-based with variation -- no
// repeated sentences within a season". That is a claim about output, not about
// code, so this measures it on output the game engine actually produced: real
// clubs, the real 272-game schedule, real scores and real injuries.
//
// Three things are worth failing on:
//
//   Repetition. A single duplicated headline inside one season breaks the
//   guarantee outright, so the count must be zero, not low.
//   Drops. The ledger refuses to repeat itself, and a fact it cannot phrase is
//   dropped. A high drop rate means the template banks are too thin.
//   Mix. A feed that is nine-tenths injuries is technically varied and useless.

import { writeFileSync } from 'node:fs';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  categoryCounts, createLedger, generateWeeklyNews, NEWS_CATEGORIES, NEWS_RULES,
  TEMPLATE_KINDS, type NewsCategory, type NewsItem,
} from '../../supabase/functions/_shared/engine/news/index.ts';
import { simulateSeasonForNews } from './season.ts';

interface Options {
  seasons: number;
  seed: number;
  print: number;
  out: string | undefined;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { seasons: 5, seed: 20260907, print: 3, out: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (next === undefined) continue;
    if (argv[i] === '--seasons') { options.seasons = Number(next); i += 1; }
    else if (argv[i] === '--seed') { options.seed = Number(next); i += 1; }
    else if (argv[i] === '--print') { options.print = Number(next); i += 1; }
    else if (argv[i] === '--out') { options.out = next; i += 1; }
  }
  return options;
}

const RULE = '-'.repeat(78);
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
const fmt = (v: number, dp = 2): string => (Number.isFinite(v) ? v.toFixed(dp) : '-');

interface SeasonRun {
  readonly season: number;
  readonly items: readonly NewsItem[];
  readonly dropped: number;
  readonly distinctHeadlines: number;
  readonly weeks: number;
  /** Games no side could be fielded for. Reported so a season that quietly
   *  fell apart cannot read as a clean run. */
  readonly abandoned: number;
}

/** One season of football, one ledger, one feed. */
function runSeason(season: number, seed: number): SeasonRun {
  const { weeks, abandoned } = simulateSeasonForNews(season, seed);
  const ledger = createLedger(season);
  const rng = createRng(seed ^ 0x5eed);

  const items: NewsItem[] = [];
  for (const week of weeks) items.push(...generateWeeklyNews(week, ledger, rng));

  return {
    season,
    items,
    dropped: ledger.dropped,
    distinctHeadlines: new Set(items.map((i) => i.headline)).size,
    weeks: weeks.length,
    abandoned,
  };
}

/** Headlines published more than once inside one season. */
function duplicatesIn(items: readonly NewsItem[]): { headline: string; count: number }[] {
  const seen = new Map<string, number>();
  for (const item of items) seen.set(item.headline, (seen.get(item.headline) ?? 0) + 1);
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([headline, count]) => ({ headline, count }))
    .sort((a, b) => b.count - a.count);
}

/** The feed as a reader would see it, for a handful of weeks. */
function sampleFeed(run: SeasonRun, weeks: number): string[] {
  const lines: string[] = [];
  const byWeek = new Map<number, NewsItem[]>();
  for (const item of run.items) {
    const list = byWeek.get(item.week) ?? [];
    list.push(item);
    byWeek.set(item.week, list);
  }
  for (const week of [...byWeek.keys()].sort((a, b) => a - b).slice(0, weeks)) {
    lines.push(`  Season ${run.season}, week ${week}`);
    for (const item of byWeek.get(week) ?? []) {
      lines.push(`    [${String(item.importance)}] ${item.category.padEnd(10)} ${item.headline}`);
      if (item.body !== null) lines.push(`         ${item.body}`);
    }
    lines.push('');
  }
  return lines;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const runs: SeasonRun[] = [];
  for (let i = 0; i < options.seasons; i += 1) {
    runs.push(runSeason(2026 + i, options.seed + i * 7919));
  }

  const allItems = runs.flatMap((r) => r.items);
  const published = allItems.length;
  const dropped = runs.reduce((a, r) => a + r.dropped, 0);
  const duplicates = runs.flatMap((r) => duplicatesIn(r.items));

  // Across seasons repetition is allowed and expected: a fresh ledger each year
  // is what lets a good line come back in 2031. The count is here so that
  // number is visible rather than mistaken for a defect.
  const distinctOverall = new Set(allItems.map((i) => i.headline)).size;

  const counts = categoryCounts(allItems);
  const importance = allItems.map((i) => i.importance);
  const perWeek = runs.map((r) => r.items.length / Math.max(r.weeks, 1));

  const teamShare = new Map<string, number>();
  for (const item of allItems) {
    if (item.teamId === null) continue;
    teamShare.set(item.teamId, (teamShare.get(item.teamId) ?? 0) + 1);
  }
  const teamCounts = [...teamShare.values()].sort((a, b) => b - a);

  const sections: string[] = [
    '',
    'NEWS FEED REPORT',
    RULE,
    `  seasons                      ${options.seasons}`,
    `  seed                         ${options.seed}`,
    `  template kinds               ${TEMPLATE_KINDS.length}`,
    `  cap per week                 ${NEWS_RULES.maxPerWeek}`,
    `  cap per category             ${NEWS_RULES.maxPerCategory}`,
    `  games abandoned              ${runs.reduce((a, r) => a + r.abandoned, 0)}` +
      `  (no fieldable side; the feed says nothing about them)`,
    '',
    'VARIATION',
    RULE,
    `  headlines published          ${published}`,
    `  distinct within each season  ${runs.map((r) => `${r.distinctHeadlines}/${r.items.length}`).join('  ')}`,
    `  repeats within a season      ${duplicates.length}   ${duplicates.length === 0 ? '(the guarantee holds)' : '(GUARANTEE BROKEN)'}`,
    `  distinct across all seasons  ${distinctOverall} of ${published}  (${pct(distinctOverall / Math.max(published, 1))})`,
    `  facts dropped as unphrasable ${dropped}  (${pct(dropped / Math.max(published + dropped, 1))} of candidates)`,
    '',
    ...(duplicates.length === 0 ? [] : [
      '  repeated headlines:',
      ...duplicates.slice(0, 10).map((d) => `    ${String(d.count)}x  ${d.headline}`),
      '',
    ]),
    '  A repeat inside one season is a failure, not a rate to minimise. Across',
    '  seasons the ledger resets on purpose, so the same line returning years',
    '  later is the design and not a defect.',
    '',
    'MIX',
    RULE,
    ...NEWS_CATEGORIES.map((category: NewsCategory) =>
      `  ${category.padEnd(28)}${String(counts[category]).padStart(5)}` +
      `   ${pct(counts[category] / Math.max(published, 1)).padStart(7)}`),
    '',
    `  stories per week             ${fmt(perWeek.reduce((a, b) => a + b, 0) / Math.max(perWeek.length, 1), 1)}`,
    `  mean importance              ${fmt(importance.reduce((a, b) => a + b, 0) / Math.max(importance.length, 1), 2)} of 5`,
    `  clubs with coverage          ${teamShare.size} of 32`,
    `  most / least covered club    ${teamCounts[0] ?? 0} / ${teamCounts[teamCounts.length - 1] ?? 0} stories`,
    '',
    '  Every club should appear. A club nobody writes about is a club the',
    '  player has no reason to look at.',
    '',
    'SAMPLE FEED',
    RULE,
    ...(runs[0] === undefined ? [] : sampleFeed(runs[0], options.print)),
  ];

  const text = sections.join('\n');
  process.stdout.write(text + '\n');
  if (options.out !== undefined) {
    writeFileSync(options.out, text + '\n', 'utf8');
    process.stderr.write(`  written to ${options.out}\n`);
  }

  if (duplicates.length > 0) process.exitCode = 1;
}

main();
