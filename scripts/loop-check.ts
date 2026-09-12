// Walks the loop through the API and counts the rows that land.
//
// Not a test: a witness. After every step it queries Postgres directly and
// prints the count per runtime table, because a screen rendering is not
// evidence that anything was written.
//
//   DATABASE_URL=postgres://... API_URL=http://localhost:8787 node scripts/loop-check.ts [seasons]

import postgres from 'postgres';
import { parseDatabaseUrl } from '../supabase/functions/_shared/api/db.ts';
import type { CreateSaveOut } from '../supabase/functions/_shared/api/createSave.ts';
import type { WeekOutcome } from '../supabase/functions/_shared/api/week.ts';

const DATABASE_URL = process.env['DATABASE_URL'];
const API_URL = process.env['API_URL'] ?? 'http://localhost:8787';
const TEAM = process.env['TEAM'] ?? 'BUF';
const SEASONS = Number(process.argv[2] ?? '1');
if (DATABASE_URL === undefined) { process.stderr.write('DATABASE_URL is not set\n'); process.exit(2); }

const TABLES = [
  'save_documents', 'players', 'team_rosters', 'free_agents', 'player_contracts',
  'contract_years', 'salary_cap', 'team_depth_charts', 'season_schedule', 'game_results',
  'player_game_stats', 'player_season_stats', 'standings', 'player_injuries', 'news',
  'transactions', 'draft_picks', 'league_history', 'player_season_grades',
  'team_season_summary', 'player_career_totals',
];

const sql = postgres({ ...parseDatabaseUrl(DATABASE_URL), max: 1 });
// A plain fetch rather than src/data/client.ts: that module is written for
// the bundler (extensionless imports) and node cannot resolve it.
const api = {
  async call<Out>(route: string, input: unknown): Promise<Out> {
    const res = await fetch(`${API_URL}/${route}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    const body: unknown = await res.json();
    if (!res.ok) throw new Error(`${route}: ${JSON.stringify(body)}`);
    return body as Out;
  },
};

async function counts(saveId: string, label: string): Promise<void> {
  const parts: string[] = [];
  for (const t of TABLES) {
    const [r] = await sql<{ n: string }[]>`
      select count(*) as n from public.${sql(t)} where save_id = ${saveId}`;
    parts.push(`${t}=${r?.n ?? '?'}`);
  }
  const [s] = await sql<{ season: number; week: number; phase: string }[]>`
    select season, week, phase from public.saves where id = ${saveId}`;
  process.stdout.write(`\n== ${label}  (season ${String(s?.season)} week ${String(s?.week)} ${s?.phase ?? ''})` + '\n');
  process.stdout.write(parts.join('  ') + '\n');
}

const created = await api.call<CreateSaveOut>('create-save', { name: 'Loop check', teamId: TEAM });
await counts(created.saveId, 'after create-save');

for (let season = 0; season < SEASONS; season += 1) {
  let t = Date.now();
  let outcome = await api.call<WeekOutcome>('sim-week', { saveId: created.saveId });
  process.stdout.write(`week 1: played ${String(outcome.played)}, abandoned ${String(outcome.abandoned.length)}, ${String(Date.now() - t)}ms\n`);
  await counts(created.saveId, `after sim-week (season ${String(outcome.season)})`);
  while (outcome.phase === 'REGULAR_SEASON') {
    t = Date.now();
    outcome = await api.call<WeekOutcome>('sim-week', { saveId: created.saveId });
    process.stdout.write(`week ${String(outcome.week - 1)}: ${String(Date.now() - t)}ms\n`);
    if (outcome.abandoned.length > 0) process.stdout.write(`week ${String(outcome.week - 1)} abandoned: ${outcome.abandoned.join(', ')}\n`);
  }
  await counts(created.saveId, `after the regular season ${String(outcome.season)}`);
  while (outcome.phase === 'PLAYOFFS') {
    t = Date.now();
    outcome = await api.call<WeekOutcome>('sim-week', { saveId: created.saveId });
    process.stdout.write(`playoff week ${String(outcome.week - 1)}: played ${String(outcome.played)}, ${String(Date.now() - t)}ms${outcome.champion === null ? '' : ` -- champion ${outcome.champion}`}\n`);
  }
  await counts(created.saveId, `after the playoffs ${String(outcome.season)}`);
  const book = await sql<{ team_id: string; conference_seed: number | null; playoff_result: string | null }[]>`
    select team_id, conference_seed, playoff_result from public.league_history
     where save_id = ${created.saveId} and season = ${outcome.season} and playoff_result <> 'MISSED'
     order by conference_seed`;
  process.stdout.write(`book: ${book.map((r) => `${r.team_id}#${String(r.conference_seed)}=${r.playoff_result ?? ''}`).join(' ')}\n`);
  if (season + 1 < SEASONS) {
    t = Date.now();
    const rolled = await api.call<Record<string, unknown>>('advance-season', { saveId: created.saveId });
    process.stdout.write(`advance-season: ${JSON.stringify(rolled)} in ${String(Date.now() - t)}ms\n`);
    await counts(created.saveId, 'after advance-season');
  }
}
process.stdout.write(`\nsave ${created.saveId}` + '\n');
await sql.end();
