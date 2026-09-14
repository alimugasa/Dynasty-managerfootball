// Walks the whole loop in a headless browser, against the running app and
// shim, and counts the rows in Postgres after every step.
//
//   DATABASE_URL=... APP_URL=http://localhost:5173 node scripts/walk.ts
//
// A witness, not a test: it prints what it saw and what landed. The e2e suite
// asserts; this shows.

import { chromium, type Page } from '@playwright/test';
import postgres from 'postgres';
import { parseDatabaseUrl } from '../supabase/functions/_shared/api/db.ts';

const DATABASE_URL = process.env['DATABASE_URL'];
const APP_URL = process.env['APP_URL'] ?? 'http://localhost:5173';
/** The club to walk in on, by the id that is also its badge. Named by id
 *  rather than by nickname because the board's rows carry the nickname alone
 *  and two markets could share one. */
const TEAM_ID = process.env['TEAM_ID'] ?? 'BUF';
if (DATABASE_URL === undefined) { process.stderr.write('DATABASE_URL is not set\n'); process.exit(2); }
const sql = postgres({ ...parseDatabaseUrl(DATABASE_URL), max: 1 });
const out = (s: string): void => { process.stdout.write(`${s}\n`); };

const TABLES = [
  'game_results', 'player_game_stats', 'player_season_stats', 'standings', 'player_injuries',
  'news', 'team_depth_charts', 'transactions', 'draft_picks', 'league_history',
  'player_season_grades', 'team_season_summary', 'player_career_totals', 'season_schedule',
  'team_rosters', 'free_agents', 'player_contracts', 'salary_cap', 'players',
];

async function counts(label: string): Promise<void> {
  const [s] = await sql<{ id: string; season: number; week: number; phase: string }[]>`
    select id, season, week, phase from public.saves
     where user_id = '00000000-0000-0000-0000-000000000001' order by updated_at desc limit 1`;
  if (s === undefined) { out(`== ${label}: no save`); return; }
  const parts: string[] = [];
  for (const t of TABLES) {
    const [r] = await sql<{ n: string }[]>`select count(*) as n from public.${sql(t)} where save_id = ${s.id}`;
    parts.push(`${t}=${r?.n ?? '?'}`);
  }
  out(`== ${label}  [save ${s.id.slice(0, 8)} season ${String(s.season)} week ${String(s.week)} ${s.phase}]`);
  out(`   ${parts.join(' ')}`);
}

const tab = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

// The full Chromium the e2e suite runs on, when the headless shell build
// Playwright's library defaults to is not installed.
const executablePath = process.env['CHROME_PATH'];
const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => { out(`PAGE ERROR: ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error') out(`CONSOLE ERROR: ${m.text()}`); });
page.on('requestfailed', (r) => { out(`REQUEST FAILED: ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`); });

await page.goto(APP_URL);
await page.getByRole('heading', { level: 1 }).waitFor();

// A fresh start every walk, through the front door. If a dynasty is already
// open, the Office closes it first; then New Game, an empty save file, a GM
// name and a club -- the same five taps a player makes.
if (await page.getByTestId('new-game').count() === 0) {
  await tab(page, 'Office').click();
  await page.getByTestId('to-menu').click();
  await page.getByTestId('new-game').waitFor({ timeout: 30_000 });
}
await page.getByTestId('new-game').click();
await page.getByTestId('slot-list').waitFor({ timeout: 30_000 });
const emptyFile = page.locator('[data-empty-slot] button');
if (await emptyFile.count() === 0) {
  // Every file is in use. Clear the first one: this is a witness script and it
  // starts from nothing by design.
  await page.getByTestId('delete-1').click();
  await page.getByTestId('delete-confirm-1').click();
  await emptyFile.first().waitFor({ timeout: 30_000 });
}
await emptyFile.first().click();
await page.getByTestId('gm-first').fill('Walk');
await page.getByTestId('gm-last').fill('Manager');
await page.getByTestId('gm-continue').click();
await page.getByTestId('club-list').waitFor({ timeout: 30_000 });
// The board, the scouting report, the rules, then the confirmation: nothing is
// written until the button on the last of those.
await page.getByTestId('board-search').fill(TEAM_ID);
await page.getByTestId(`team-${TEAM_ID}`).click();
await page.getByTestId('confirm-team').click();
await page.getByTestId('setup-continue').click();
await page.getByTestId('create-franchise').click();
// The franchise opens on the dashboard.
await page.getByTestId('this-week').waitFor({ timeout: 60_000 });
out(`created a dynasty on ${TEAM_ID}: ${await page.getByRole('heading', { level: 1 }).innerText()}`);
// What the first screen after the world is built actually says. Every one of
// these is read off the save, so a dashboard that rendered before the rows
// landed would show up here as a dash.
out(`   dashboard: ${(await page.getByTestId('rating-rings').innerText()).replace(/\n/g, ' ')}`);
out(`   owner: ${(await page.getByTestId('owner-goal').innerText())}`
  + ` · week: ${(await page.getByTestId('week-opponent').innerText())}`);
await counts('after create');

// Depth chart: swap the first two quarterbacks. The roster is a list inside
// Team now rather than a tab of its own.
await tab(page, 'Team').click();
await page.getByTestId('to-roster').click();
await page.getByTestId('depth-list').waitFor();
const nameOf = async (row: number): Promise<string> =>
  (await page.getByTestId(`depth-row-${String(row)}`).locator('button').first().innerText()).split('\n')[0] ?? '';
const [wasFirst, wasSecond] = [await nameOf(0), await nameOf(1)];
await page.getByTestId('move-up-1').click();
// The list re-reads from the API after the write; wait for the new order, not
// for the old one to vanish.
await page.waitForFunction((expected) => {
  const row = document.querySelector('[data-testid="depth-row-0"] button');
  return row !== null && (row.textContent ?? '').startsWith(expected);
}, wasSecond, { timeout: 15_000 });
out(`depth chart: QB1 "${wasFirst}" -> "${await nameOf(0)}", QB2 now "${await nameOf(1)}"`);
const [starter] = await sql<{ player_id: string; display_name: string; is_starter: boolean }[]>`
  select d.player_id, p.display_name, d.is_starter from public.team_depth_charts d
   join public.saves s on s.id = d.save_id and s.user_team_id = d.team_id
   join public.players p on p.save_id = d.save_id and p.player_id = d.player_id
  where s.user_id = '00000000-0000-0000-0000-000000000001' and d.slot = 'QB' and d.depth_order = 1
  order by s.updated_at desc limit 1`;
out(`   team_depth_charts QB1 now ${starter?.player_id ?? '?'} ${starter?.display_name ?? ''} (starter ${String(starter?.is_starter)})`);

// Sim a week.
await tab(page, 'Play').click();
await page.getByTestId('sim-week').waitFor({ timeout: 30_000 });
await page.getByTestId('sim-week').click();
await page.getByText(/Week 2 of/).waitFor({ timeout: 60_000 });
await counts('after sim week 1');

// Box score.
await page.getByText(/Last result/).first().waitFor();
await page.locator('text=Last result').first()
  .locator('xpath=following::*[@role="button" or self::button][1]').click().catch(() => undefined);
await page.getByTestId('home-score').waitFor({ timeout: 15_000 });
const box = await page.getByTestId('box-team-stats').innerText();
out(`box score: ${(await page.getByTestId('away-score').innerText())}-${await page.getByTestId('home-score').innerText()}; rows: ${box.split('\n').slice(0, 6).join(' | ')}`);
await page.getByRole('button', { name: 'Back' }).click();

// Standings.
await tab(page, 'League').click();
// One tbody per group: the table splits by conference by default, so this is
// two of them, and eight under the division split.
await page.getByTestId('standings-body').first().waitFor();
await page.getByTestId('leader-board').waitFor();
out(`standings rows: ${String(await page.locator('[data-testid="standings-body"] tr').count())}; leaderboard rows: ${String(await page.locator('[data-testid="leader-board"] > *').count())}`);

// News.
await tab(page, 'News').click();
await page.getByTestId('news-feed').waitFor({ timeout: 15_000 });
out(`news rows on screen: ${String(await page.locator('[data-testid="news-feed"] > *').count())}`);

// Sim to the end of the regular season. It stops at the bracket by design, so
// this then plays the bracket a round at a time -- which is what a player does,
// and the only way the season reaches the offseason.
await tab(page, 'Play').click();
await page.getByTestId('sim-season').waitFor({ timeout: 30_000 });
await page.getByTestId('sim-season').click();
await page.getByTestId('view-bracket').waitFor({ timeout: 300_000 });
await counts('after sim to end of regular season');

// Four rounds, and a bound rather than a while(true): a bracket that stopped
// making progress should fail the walk, not hang it.
for (let round = 0; round < 6; round += 1) {
  if (await page.getByTestId('next-season').count() > 0) break;
  // The button names the round it plays, so the round it names next is the
  // signal that this one finished. Waiting on the button to re-enable would
  // race the request; waiting on the text does not.
  const was = await page.getByTestId('sim-week').innerText();
  await page.getByTestId('sim-week').click();
  await page.waitForFunction(
    (before) => {
      if (document.querySelector('[data-testid="next-season"]') !== null) return true;
      const btn = document.querySelector('[data-testid="sim-week"]');
      return btn !== null && (btn.textContent ?? '') !== before;
    },
    was, { timeout: 300_000 });
  const now = await page.getByTestId('next-season').count() > 0
    ? 'the season is over'
    : await page.getByTestId('sim-week').innerText();
  out(`played a round: "${was}" -> next: ${now}`);
}
await page.getByTestId('next-season').waitFor({ timeout: 300_000 });
await counts('after the bracket');

// Offseason.
await page.getByTestId('next-season').click();
await page.getByTestId('sim-week').waitFor({ timeout: 300_000 });
out(`now: ${await page.locator('header, h1').first().innerText()} / ${await page.getByText(/Week 1 of/).innerText()}`);
await counts('after offseason');

// Season 2, week 1.
await page.getByTestId('sim-week').click();
await page.getByText(/Week 2 of/).waitFor({ timeout: 60_000 });
await counts('after sim week 1 of season 2');

await browser.close();
await sql.end();
