// Builds a 50-season save in Postgres, to measure queries against.
//
// THIS IS A LOAD FIXTURE, NOT GAMEPLAY DATA. The distinction matters and is
// kept sharp deliberately:
//
//   Real, from the engine: which players exist in which season, how rosters
//   churn, who retires, who arrives in each draft class, team assignments and
//   ages. That is `runOffseason` driving the same career league the drift
//   report uses, so the cardinality a query planner sees -- distinct players
//   per season, players per club, how player ids accumulate over fifty years --
//   is the cardinality the real game produces.
//
//   Synthesised: the statistical columns themselves. Bridging a CareerPlayer to
//   the per-attribute EnginePlayer the game simulation needs is a modelling
//   decision that belongs to the save system, not to a performance audit, so
//   stat values are drawn from the distributions docs/sim-report-baseline.txt
//   measures rather than simulated. Row counts, key distributions and index
//   selectivity are therefore real; the yardage in any given row is not.
//
// Nothing here is a source of truth about football. It exists so that
// scripts/perf/bench.ts can time real SQL against a real table of the real
// size, instead of guessing.
//
//   node scripts/perf/fixture.ts [--seasons 50] [--db dmp_perf]

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRng, type Rng } from '../../supabase/functions/_shared/engine/rng.ts';
import { runOffseason } from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { loadCareerLeague, FIRST_SEASON } from '../drift-report/careerLeague.ts';
import { readSeedCsv } from '../lib/seedCsv.ts';

interface Options { seasons: number; db: string }

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { seasons: 50, db: 'dmp_perf' };
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (next === undefined) continue;
    if (argv[i] === '--seasons') { options.seasons = Number(next); i += 1; }
    else if (argv[i] === '--db') { options.db = next; i += 1; }
  }
  return options;
}

const PG = { PGHOST: '/tmp', PGPORT: '55432', PGUSER: 'postgres' };
const SAVE_ID = '11111111-2222-3333-4444-555555555555';
const OWNER_ID = '99999999-8888-7777-6666-555555555555';

function psql(db: string, sql: string): string {
  return execFileSync('psql', ['-q', '-d', db, '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { env: { ...process.env, ...PG }, encoding: 'utf8' });
}

function copyIn(db: string, table: string, columns: readonly string[], file: string): void {
  execFileSync('psql', ['-q', '-d', db, '-v', 'ON_ERROR_STOP=1', '-c',
    `\\copy public.${table} (${columns.join(',')}) from '${file}' with (format csv)`],
    { env: { ...process.env, ...PG }, stdio: 'pipe' });
}

/** CSV field: everything is quoted, quotes doubled. Cheap and unambiguous. */
const q = (v: string | number | boolean | null): string =>
  (v === null ? '' : `"${String(v).replace(/"/g, '""')}"`);
const row = (...vals: (string | number | boolean | null)[]): string =>
  vals.map(q).join(',');

/** Normal draw, clamped. The stat columns only need a believable spread. */
function normal(rng: Rng, mean: number, sd: number, lo: number, hi: number): number {
  const u = Math.max(1e-9, rng.float());
  const v = rng.float();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(lo, Math.min(hi, mean + z * sd));
}

export function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const { db } = options;
  const dir = mkdtempSync(join(tmpdir(), 'dmp-perf-'));
  const rng = createRng(20260907);

  process.stderr.write(`  building ${String(options.seasons)} seasons into ${db}\n`);

  // ------------------------------------------------------------- the world
  const teamRows = readSeedCsv('teams');
  const teamIds = teamRows.map((r) => r['team_id'] ?? '').filter((id) => id !== '');

  psql(db, `delete from public.saves where id = '${SAVE_ID}'`);
  // A non-template save must be owned (saves_template_ownership), so the
  // fixture owns itself through a local test user.
  psql(db, `insert into auth.users (id) values ('${OWNER_ID}') on conflict do nothing`);
  psql(db, `insert into public.profiles (user_id, handle) values ('${OWNER_ID}', 'perf')
            on conflict do nothing`);
  psql(db, `insert into public.saves (id, user_id, name, user_team_id, season, rng_seed, engine_version)
            values ('${SAVE_ID}', '${OWNER_ID}', 'perf fixture', '${teamIds[0] ?? 'AAA'}', 2026, 1, 'perf')`);

  const conferences = [...new Set(teamRows.map((r) => r['conference_id'] ?? ''))].filter(Boolean);
  const divisions = [...new Set(teamRows.map((r) => r['division_id'] ?? ''))].filter(Boolean);

  writeFileSync(join(dir, 'leagues.csv'), `${row(SAVE_ID, 'L1', 'League', 'LG')}\n`);
  writeFileSync(join(dir, 'conf.csv'),
    conferences.map((c) => row(SAVE_ID, c, `Conference ${c}`, 'L1')).join('\n') + '\n');
  writeFileSync(join(dir, 'div.csv'), divisions.map((d) => {
    const first = teamRows.find((r) => r['division_id'] === d);
    return row(SAVE_ID, d, first?.['conference_id'] ?? conferences[0] ?? '', `Division ${d}`);
  }).join('\n') + '\n');
  writeFileSync(join(dir, 'teams.csv'), teamRows.map((r) => row(
    SAVE_ID, r['team_id'] ?? '', r['metro_area'] ?? '', r['nickname'] ?? '',
    r['division_id'] ?? '', r['conference_id'] ?? '',
    r['primary_color'] ?? '#000000', r['secondary_color'] ?? '#ffffff',
  )).join('\n') + '\n');

  copyIn(db, 'leagues', ['save_id', 'league_id', 'name', 'abbreviation'], join(dir, 'leagues.csv'));
  copyIn(db, 'league_conferences', ['save_id', 'conference_id', 'name', 'league_id'], join(dir, 'conf.csv'));
  copyIn(db, 'league_divisions', ['save_id', 'division_id', 'conference_id', 'name'], join(dir, 'div.csv'));
  copyIn(db, 'teams', ['save_id', 'team_id', 'metro_area', 'nickname', 'division_id',
    'conference_id', 'primary_color', 'secondary_color'], join(dir, 'teams.csv'));

  // ------------------------------------------------- fifty seasons of career
  const league = loadCareerLeague();
  const seenPlayers = new Map<string, { name: string; group: string; age: number }>();

  const players: string[] = [];
  const stats: string[] = [];
  const grades: string[] = [];
  const standings: string[] = [];
  const games: string[] = [];
  const schedule: string[] = [];
  const news: string[] = [];
  const transactions: string[] = [];

  for (let s = 0; s < options.seasons; s += 1) {
    const season = FIRST_SEASON + s;
    league.season = season;
    const active = league.players.filter((p) => !p.retired && p.teamId !== null);

    for (const p of active) {
      if (!seenPlayers.has(p.id)) {
        seenPlayers.set(p.id, { name: p.name, group: p.group, age: p.age });
        players.push(row(SAVE_ID, p.id, p.name, p.group, p.group, p.age,
          p.experience, Math.round(p.ability), Math.round(p.potential)));
      }

      // Statistical columns: shape only. See the header.
      const isQb = p.group === 'QB';
      const isRb = p.group === 'RB';
      const isRec = p.group === 'WR' || p.group === 'TE';
      const gp = Math.round(normal(rng, 15, 3.4, 1, 18));
      const att = isQb ? Math.round(normal(rng, 500, 130, 0, 760)) : 0;
      const cmp = Math.round(att * normal(rng, 0.64, 0.05, 0.3, 0.78));
      const py = Math.round(cmp * normal(rng, 11.4, 1.1, 6, 16));
      const rush = isRb ? Math.round(normal(rng, 210, 80, 0, 420))
        : isQb ? Math.round(normal(rng, 45, 25, 0, 150)) : 0;
      const ry = Math.round(rush * normal(rng, 4.3, 0.8, 1.5, 7));
      const tgt = isRec ? Math.round(normal(rng, 95, 45, 0, 210)) : 0;
      const rec = Math.round(tgt * normal(rng, 0.63, 0.07, 0.3, 0.85));
      const recy = Math.round(rec * normal(rng, 12.2, 2.1, 5, 20));
      const sacks = (p.group === 'EDGE' || p.group === 'DT')
        ? Number(normal(rng, 6.5, 4.2, 0, 24).toFixed(1)) : 0;

      stats.push(row(SAVE_ID, season, 'REGULAR', p.id, p.teamId, p.group, gp,
        Math.round(gp * 0.8), att, cmp, py, Math.round(py / 130),
        Math.round(att * 0.025), Math.round(normal(rng, 24, 12, 0, 60)),
        Number(normal(rng, 88, 16, 20, 158).toFixed(1)),
        rush, ry, Math.round(ry / 220), Math.round(normal(rng, 2, 1.5, 0, 8)),
        tgt, rec, recy, Math.round(recy / 160),
        Math.round(normal(rng, 45, 30, 0, 160)), sacks));

      const grade = normal(rng, 62, 13, 0, 100);
      grades.push(row(SAVE_ID, season, 'REGULAR', p.id, p.teamId, p.group,
        Math.round(normal(rng, 620, 260, 20, 1150)),
        Number(grade.toFixed(1)), Number(((grade - 62) / 13).toFixed(2)),
        grade > 80 ? 'A' : grade > 68 ? 'B' : grade > 55 ? 'C' : 'D', null));
    }

    // Standings, schedule and results: a real 272-game round.
    const wins = new Map(teamIds.map((t) => [t, 0]));
    let g = 0;
    for (let week = 1; week <= 18; week += 1) {
      for (let i = 0; i < 16; i += 1) {
        const home = teamIds[(i * 2 + week) % teamIds.length] ?? '';
        const away = teamIds[(i * 2 + 1 + week * 3) % teamIds.length] ?? '';
        if (home === away || home === '' || away === '') continue;
        const gameId = `G${season}W${week}N${i}`;
        g += 1;
        const hs = Math.round(normal(rng, 22.4, 9.5, 0, 59));
        const as_ = Math.round(normal(rng, 21.6, 9.5, 0, 59));
        schedule.push(row(SAVE_ID, gameId, season, week, 'REGULAR', home, away, 'FINAL'));
        games.push(row(SAVE_ID, gameId, season, week, 'REGULAR', home, away, hs, as_,
          Math.round(normal(rng, 245, 70, 20, 520)), Math.round(normal(rng, 118, 45, 0, 320)),
          Math.round(normal(rng, 245, 70, 20, 520)), Math.round(normal(rng, 118, 45, 0, 320))));
        wins.set(hs >= as_ ? home : away, (wins.get(hs >= as_ ? home : away) ?? 0) + 1);
      }
    }
    for (const [teamId, w] of wins) {
      const l = Math.max(0, 17 - w);
      standings.push(row(SAVE_ID, season, teamId, w, l, 0,
        Number((w / Math.max(1, w + l)).toFixed(3)),
        Math.round(normal(rng, 380, 70, 120, 620)), Math.round(normal(rng, 380, 70, 120, 620))));
    }

    for (let n = 0; n < 135; n += 1) {
      news.push(row(SAVE_ID, season, Math.min(18, 1 + Math.floor(n / 8)), 'REGULAR_SEASON',
        (['UPSET', 'STREAK', 'MILESTONE', 'INJURY', 'HOT_SEAT', 'AWARD_RACE'] as const)[n % 6] ?? 'UPSET',
        `Headline ${season}-${n}`, `Body ${season}-${n}`,
        teamIds[n % teamIds.length] ?? null, null, 1 + (n % 5)));
    }

    if (g !== 288) process.stderr.write(`    season ${String(season)}: ${String(g)} games\n`);

    // The offseason is run here rather than counted from a guess: the number of
    // transactions a season produces is draft picks plus signings plus
    // retirements plus releases, and those are outputs of the engine. Assuming
    // a round number would have put the busiest table in this fixture at a size
    // nothing measured.
    const off = runOffseason(league, rng);
    const events: [string, number][] = [
      ['DRAFT_SELECTION', off.draft.picks.length],
      ['ROOKIE_SIGNING', off.draft.signedUndrafted],
      ['FREE_AGENT_SIGNING', off.freeAgency.signings.length],
      ['RETIREMENT', off.retired.length],
      // Releases are not counted: they happen inside cap compliance and the
      // engine does not report them. An assumed number here would be the one
      // invented figure in a table this audit is about to draw conclusions
      // from, so the fixture is short a transaction kind and says so.
    ];
    let t = 0;
    for (const [kind, count] of events) {
      for (let i = 0; i < count; i += 1) {
        t += 1;
        transactions.push(row(SAVE_ID, season, null, 'OFFSEASON', kind,
          teamIds[t % teamIds.length] ?? null, null, `${kind} ${season}-${String(i)}`));
      }
    }
    if (s % 10 === 0) process.stderr.write(`    ${String(season)}: ${String(seenPlayers.size)} players seen\n`);
  }

  // ------------------------------------------------------------------ load
  const bulk: [string, string[], string[]][] = [
    ['players', ['save_id', 'player_id', 'display_name', 'position', 'position_group',
      'age', 'experience_years', 'overall_rating', 'potential_rating'], players],
    ['season_schedule', ['save_id', 'game_id', 'season', 'week', 'competition',
      'home_team_id', 'away_team_id', 'status'], schedule],
    ['game_results', ['save_id', 'game_id', 'season', 'week', 'competition',
      'home_team_id', 'away_team_id', 'home_score', 'away_score',
      'home_pass_yards', 'home_rush_yards', 'away_pass_yards', 'away_rush_yards'], games],
    ['player_season_stats', ['save_id', 'season', 'competition', 'player_id', 'team_id',
      'position', 'games_played', 'games_started', 'pass_att', 'completions', 'pass_yards',
      'pass_tds', 'interceptions', 'sacks_taken', 'passer_rating', 'rushes', 'rush_yards',
      'rush_tds', 'fumbles', 'targets', 'receptions', 'rec_yards', 'rec_tds',
      'tackles', 'sacks'], stats],
    ['player_season_grades', ['save_id', 'season', 'competition', 'player_id', 'team_id',
      'position', 'snaps', 'grade', 'grade_z', 'grade_letter', 'position_rank'], grades],
    ['standings', ['save_id', 'season', 'team_id', 'wins', 'losses', 'ties', 'win_pct',
      'points_for', 'points_against'], standings],
    ['news', ['save_id', 'season', 'week', 'phase', 'category', 'headline', 'body',
      'team_id', 'player_id', 'importance'], news],
    ['transactions', ['save_id', 'season', 'week', 'phase', 'kind', 'team_id',
      'player_id', 'detail'], transactions],
  ];

  for (const [table, columns, rows] of bulk) {
    const file = join(dir, `${table}.csv`);
    writeFileSync(file, rows.join('\n') + '\n');
    copyIn(db, table, columns, file);
    process.stderr.write(`  ${table.padEnd(22)}${String(rows.length).padStart(8)} rows\n`);
  }

  // players.team_id is the club a player is at NOW, so it is written from the
  // final league state: everyone who retired across the fifty seasons has none.
  // Left unset, every club's roster read would have matched all 13,792 players
  // ever to exist, and the roster benchmark would have measured the wrong thing.
  const finalTeams = league.players
    .filter((p) => !p.retired && p.teamId !== null && seenPlayers.has(p.id))
    .map((p) => row(p.id, p.teamId));
  const teamFile = join(dir, 'final_teams.csv');
  writeFileSync(teamFile, finalTeams.join('\n') + '\n');
  // \copy is a psql meta-command and cannot share a -c string with other
  // statements, so this goes through a script file.
  const script = join(dir, 'final_teams.sql');
  writeFileSync(script, [
    'create temp table t (player_id text, team_id text);',
    `\\copy t from '${teamFile}' with (format csv)`,
    `update public.players p set team_id = t.team_id`,
    `  from t where t.player_id = p.player_id and p.save_id = '${SAVE_ID}';`,
  ].join('\n') + '\n');
  execFileSync('psql', ['-q', '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', script],
    { env: { ...process.env, ...PG }, stdio: 'pipe' });
  process.stderr.write(`  players on a roster    ${String(finalTeams.length).padStart(8)}\n`);

  psql(db, 'analyze');
  rmSync(dir, { recursive: true, force: true });
  process.stderr.write('  done\n');
}

main();
