// Simulation distribution report.
//
//   node scripts/sim-report/index.ts [options]
//
//   --seasons N     seasons to simulate (default 1000)
//   --workers N     worker threads (default: min(cores, 4))
//   --seed N        base seed (default 20260907)
//   --targets FILE  JSON overriding any subset of scripts/sim-report/targets.ts
//   --out FILE      also write the report to a file
//   --serial        run on one thread, for debugging
//
// This report only reads. It never edits a constant, and it never writes to the
// engine. Season n always uses seed base+n, so the numbers do not depend on how
// the work was sharded and two runs with the same seed are byte-identical.

import { cpus } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { loadLeague } from './league.ts';
import { buildShard } from './shard.ts';
import { distributions, evaluate, merge, type Merged } from './metrics.ts';
import type { ShardResult } from './payload.ts';
import { TARGETS, type Target } from './targets.ts';
import { chart, flagged, header, heading, metricTable, outliers, summaryTable } from './report.ts';

interface Options {
  seasons: number;
  workers: number;
  seed: number;
  targets: string | undefined;
  out: string | undefined;
  serial: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    seasons: 1000,
    workers: Math.max(1, Math.min(cpus().length, 4)),
    seed: 20260907,
    targets: undefined,
    out: undefined,
    serial: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--serial') { options.serial = true; continue; }
    if (next === undefined) continue;
    if (arg === '--seasons') { options.seasons = Number(next); i += 1; }
    else if (arg === '--workers') { options.workers = Number(next); i += 1; }
    else if (arg === '--seed') { options.seed = Number(next); i += 1; }
    else if (arg === '--targets') { options.targets = next; i += 1; }
    else if (arg === '--out') { options.out = next; i += 1; }
  }
  if (!Number.isFinite(options.seasons) || options.seasons < 1) {
    throw new Error('--seasons must be a positive number');
  }
  return options;
}

/** Target overrides are merged field by field, so a file may supply only the
 *  ranges that changed and keep the built-in labels and tuning hints. */
function loadOverrides(path: string | undefined): Record<string, Target> {
  if (path === undefined) return {};
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`${path} must contain a JSON object keyed by metric`);
  }
  const out: Record<string, Target> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const base = TARGETS[key];
    if (base === undefined) throw new Error(`${path}: unknown metric "${key}"`);
    const patch = value as Partial<Target>;
    out[key] = {
      ...base,
      ...(typeof patch.low === 'number' ? { low: patch.low } : {}),
      ...(typeof patch.high === 'number' ? { high: patch.high } : {}),
    };
  }
  return out;
}

function runShard(
  firstSeason: number, seasonCount: number, baseSeed: number, onProgress: () => void,
): Promise<ShardResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      workerData: { firstSeason, seasonCount, baseSeed },
    });
    worker.on('message', (message: { progress?: number; done?: ShardResult }) => {
      if (message.progress !== undefined) onProgress();
      if (message.done !== undefined) resolve(message.done);
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exited with code ${code}`));
    });
  });
}

async function collect(options: Options, teamsPerSeason: number): Promise<Merged> {
  let done = 0;
  const tick = (): void => {
    done += 1;
    if (done % 10 === 0 || done === options.seasons) {
      const pct = ((done / options.seasons) * 100).toFixed(0);
      process.stderr.write(`\r  simulating ${done}/${options.seasons} seasons (${pct}%)   `);
    }
  };

  if (options.serial) {
    const shard = buildShard(loadLeague(), 0, options.seasons, options.seed, tick);
    process.stderr.write('\n');
    return merge([shard], teamsPerSeason);
  }

  const workerCount = Math.max(1, Math.min(options.workers, options.seasons));
  const base = Math.floor(options.seasons / workerCount);
  const remainder = options.seasons % workerCount;
  const jobs: Promise<ShardResult>[] = [];
  let cursor = 0;
  for (let w = 0; w < workerCount; w += 1) {
    const count = base + (w < remainder ? 1 : 0);
    jobs.push(runShard(cursor, count, options.seed, tick));
    cursor += count;
  }
  const shards = await Promise.all(jobs);
  process.stderr.write('\n');
  return merge(shards, teamsPerSeason);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const overrides = loadOverrides(options.targets);
  const league = loadLeague();

  process.stderr.write(
    `  league: ${league.teams.length} clubs, ${league.schedule.length} games, ` +
    `${league.weeks} weeks, loaded from legacy/seed\n`,
  );

  const started = Date.now();
  const merged = await collect(options, league.teams.length);
  const seconds = (Date.now() - started) / 1000;

  const dist = distributions(merged);
  const results = evaluate(merged, dist, overrides);
  const source = options.targets ?? 'scripts/sim-report/targets.ts (defaults)';

  const sections: string[] = [
    header(merged, seconds, source, options.seed),

    heading('scoring'),
    metricTable(results.filter((r) => r.key.startsWith('points') || r.key.startsWith('shutouts'))),
    '',
    summaryTable('points per team per game', dist.points),
    '',
    chart('points per team per game', merged.points, 0, 60, 5),

    heading('yardage'),
    metricTable(results.filter((r) => r.key.startsWith('yards'))),
    '',
    summaryTable('total yards per team per game', dist.yards),
    '',
    chart('total yards per team per game', merged.yards, 100, 600, 50),

    heading('passing and rushing balance'),
    metricTable(results.filter((r) => r.key.startsWith('split') || r.key.startsWith('spread'))),
    '',
    summaryTable('passing yards per team per game', dist.passYards),
    '',
    summaryTable('rushing yards per team per game', dist.rushYards),
    '',
    summaryTable('rushing attempts per team per game', dist.rushes),

    heading('win totals'),
    metricTable(results.filter((r) => r.key.startsWith('wins') || r.key.startsWith('homeWin'))),
    '',
    summaryTable('wins per team per season', dist.wins),
    '',
    chart('wins per team per season', merged.wins, 0, 18, 1),

    heading('injuries'),
    metricTable(results.filter((r) => r.key.startsWith('injury'))),
    '',
    summaryTable('injuries per team per game', dist.gameInjuries),
    '',
    summaryTable('player-games lost per season, league-wide', dist.playerGamesLost),

    heading('top-end outliers'),
    metricTable(results.filter((r) => r.key.startsWith('leader') || r.key.startsWith('record'))),
    '',
    outliers(dist),

    flagged(results),
    '',
  ];

  const text = sections.join('\n');
  process.stdout.write(text + '\n');
  if (options.out !== undefined) {
    writeFileSync(options.out, text + '\n', 'utf8');
    process.stderr.write(`  written to ${options.out}\n`);
  }

  const bad = results.filter((r) => r.status !== 'ok').length;
  // Non-zero exit when something is out of range, so CI can gate on it. The
  // report is still printed in full either way.
  process.exitCode = bad === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 2;
});
