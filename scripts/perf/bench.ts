// Measures every screen's reads, before and after.
//
//   node scripts/perf/bench.ts [--db dmp_perf] [--out FILE]
//
// Runs both halves of scripts/perf/screens.ts against the fifty-season fixture
// and reports, per screen: how many queries it issues, how many rows the
// database actually touched to answer them, and how long that took.
//
// Rows touched, not rows returned. A screen that displays five rows by reading
// eighty-four thousand is the failure mode this audit exists to find, and it is
// invisible in a report that only counts what came back. The number comes from
// EXPLAIN (ANALYZE) -- the planner's own count of rows produced by each scan
// node -- so it is measured, not inferred from the SQL.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { rosterIds, SAVE, screensFor, type ScreenSpec } from './screens.ts';

interface Options { db: string; out: string | undefined }

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { db: 'dmp_perf', out: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (next === undefined) continue;
    if (argv[i] === '--db') { options.db = next; i += 1; }
    else if (argv[i] === '--out') { options.out = next; i += 1; }
  }
  return options;
}

const PG = { PGHOST: '/tmp', PGPORT: '55432', PGUSER: 'postgres' };
const MARK = '===MARK===';

function psql(db: string, sql: string, args: readonly string[] = []): string {
  return execFileSync('psql', ['-X', '-q', '-A', '-t', '-d', db,
    '-v', 'ON_ERROR_STOP=1', ...args, '-c', sql],
    { env: { ...process.env, ...PG }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

interface PlanNode {
  'Node Type': string;
  'Actual Rows'?: number;
  'Actual Total Time'?: number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  Plans?: PlanNode[];
}

/** Rows the database actually produced at every scan, summed over the tree. */
function rowsScanned(node: PlanNode): number {
  const own = node['Node Type'].includes('Scan') ? (node['Actual Rows'] ?? 0) : 0;
  return own + (node.Plans ?? []).reduce((a, child) => a + rowsScanned(child), 0);
}

interface Measured { queries: number; rows: number; ms: number }

/**
 * Runs a set of statements and measures them.
 *
 * All of them go into one psql invocation: measuring an N+1 by spawning 54
 * processes would report the cost of process startup, not of the queries. The
 * statements still execute one at a time on one connection, which is what the
 * app would do.
 */
function measure(db: string, statements: readonly string[]): Measured {
  if (statements.length === 0) return { queries: 0, rows: 0, ms: 0 };

  const script = statements
    .map((sql) => `\\echo ${MARK}\nexplain (analyze, buffers, format json) ${sql.trim()};`)
    .join('\n');

  const out = execFileSync('psql', ['-X', '-q', '-A', '-t', '-d', db, '-v', 'ON_ERROR_STOP=1'],
    { env: { ...process.env, ...PG }, encoding: 'utf8', input: script,
      maxBuffer: 256 * 1024 * 1024 });

  let rows = 0;
  let ms = 0;
  let seen = 0;
  for (const chunk of out.split(MARK)) {
    const text = chunk.trim();
    if (text === '') continue;
    let plans: { Plan: PlanNode; 'Execution Time'?: number }[];
    try {
      plans = JSON.parse(text) as { Plan: PlanNode; 'Execution Time'?: number }[];
    } catch {
      continue;
    }
    for (const p of plans) {
      seen += 1;
      rows += rowsScanned(p.Plan);
      ms += p['Execution Time'] ?? 0;
    }
  }

  if (seen !== statements.length) {
    // A statement that did not report a plan is a statement that did not run,
    // and a total short by one query is worse than no total at all.
    throw new Error(`measured ${String(seen)} plans for ${String(statements.length)} statements`);
  }
  return { queries: statements.length, rows, ms };
}

const RULE = '-'.repeat(78);
const n = (v: number): string => v.toLocaleString('en-US');
const ms = (v: number): string => `${v.toFixed(1)}ms`;

/** How many times smaller the after is. Reported as a factor because the
 *  interesting cases span four orders of magnitude. */
function factor(before: number, after: number): string {
  if (after === 0) return before === 0 ? '-' : 'n/a';
  const f = before / after;
  if (f >= 100) return `${f.toFixed(0)}x`;
  if (f >= 1.05) return `${f.toFixed(1)}x`;
  if (f <= 0.95) return `${(1 / f).toFixed(1)}x worse`;
  return 'same';
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const { db } = options;

  const roster = psql(db,
    `select player_id from player_season_stats where save_id = '${SAVE}'
      and season = 2075 order by player_id limit 53`)
    .split('\n').map((s) => s.trim()).filter((s) => s !== '');

  if (roster.length < 53) {
    throw new Error(`fixture has ${String(roster.length)} players in 2075; run scripts/perf/fixture.ts first`);
  }

  const screens: ScreenSpec[] = screensFor(rosterIds(roster));
  const lines: string[] = ['', 'SCREEN QUERY AUDIT', RULE, ''];

  const totals = { bq: 0, br: 0, bm: 0, aq: 0, ar: 0, am: 0 };

  for (const spec of screens) {
    lines.push(`${spec.screen}`);
    const screenTotals = { bq: 0, br: 0, bm: 0, aq: 0, ar: 0, am: 0 };

    for (const region of spec.regions) {
      const before = measure(db, region.before);
      const after = measure(db, region.after);
      screenTotals.bq += before.queries; screenTotals.br += before.rows; screenTotals.bm += before.ms;
      screenTotals.aq += after.queries; screenTotals.ar += after.rows; screenTotals.am += after.ms;

      lines.push(`  ${region.name}`);
      lines.push(`    queries     ${String(before.queries).padStart(7)} -> ${String(after.queries).padEnd(7)}` +
        `  ${factor(before.queries, after.queries)}`);
      lines.push(`    rows read   ${n(before.rows).padStart(7)} -> ${n(after.rows).padEnd(7)}` +
        `  ${factor(before.rows, after.rows)}`);
      lines.push(`    time        ${ms(before.ms).padStart(7)} -> ${ms(after.ms).padEnd(7)}` +
        `  ${factor(before.ms, after.ms)}`);
    }

    lines.push(`  ${'TOTAL'.padEnd(28)}${String(screenTotals.bq).padStart(4)} q, ` +
      `${n(screenTotals.br).padStart(9)} rows, ${ms(screenTotals.bm).padStart(8)}  ->  ` +
      `${String(screenTotals.aq).padStart(3)} q, ${n(screenTotals.ar).padStart(6)} rows, ` +
      `${ms(screenTotals.am).padStart(7)}`);
    lines.push('');

    totals.bq += screenTotals.bq; totals.br += screenTotals.br; totals.bm += screenTotals.bm;
    totals.aq += screenTotals.aq; totals.ar += screenTotals.ar; totals.am += screenTotals.am;
  }

  lines.push(RULE);
  lines.push('ALL SCREENS');
  lines.push(`  queries     ${String(totals.bq).padStart(9)} -> ${String(totals.aq).padEnd(9)}  ${factor(totals.bq, totals.aq)}`);
  lines.push(`  rows read   ${n(totals.br).padStart(9)} -> ${n(totals.ar).padEnd(9)}  ${factor(totals.br, totals.ar)}`);
  lines.push(`  time        ${ms(totals.bm).padStart(9)} -> ${ms(totals.am).padEnd(9)}  ${factor(totals.bm, totals.am)}`);
  lines.push('');

  const text = lines.join('\n');
  process.stdout.write(text + '\n');
  if (options.out !== undefined) {
    writeFileSync(options.out, text + '\n', 'utf8');
    process.stderr.write(`  written to ${options.out}\n`);
  }
}

main();
