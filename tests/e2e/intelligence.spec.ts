import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, test } from '@playwright/test';
import { databaseUrl } from '../api/harness';
import { parseDatabaseUrl } from '../../supabase/functions/_shared/api/db';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { LeagueIntelligenceOut } from '../../supabase/functions/_shared/api/reads/leagueIntelligence';

test('the League grows from early rankings into award and postseason races', async ({ page, request }, info) => {
  test.setTimeout(360_000);
  const owner = randomUUID(); const sql = postgres({ ...parseDatabaseUrl(databaseUrl()), max: 1 });
  let saveId: string | undefined;
  const call = async <T,>(route: string, input: Record<string, unknown> = {}): Promise<T> => {
    const response = await request.post('http://localhost:8787/' + route, {
      headers: { 'x-dev-user': owner }, data: { saveId, ...input }, timeout: 120_000,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return await response.json() as T;
  };
  try {
    await sql`insert into auth.users (id) values (${owner})`;
    saveId = (await call<CreateSaveOut>('create-save', { name: 'League journey', teamId: 'CLE', slot: 1,
      gmFirstName: 'Ari', gmLastName: 'Vale' })).saveId;
    await page.context().setExtraHTTPHeaders({ 'x-dev-user': owner });
    await page.addInitScript((id) => { localStorage.setItem('dmp.openSaveId', id); }, saveId);
    await page.goto('/league');
    await expect(page.getByTestId('to-rankings')).toBeVisible();
    await expect(page.getByTestId('to-races')).toHaveCount(0);
    await expect(page.getByTestId('to-picture')).toHaveCount(0);
    await page.getByTestId('to-rankings').click();
    await expect(page.getByTestId('rank-team-CLE')).toContainText('Unranked');
    const initial = await call<LeagueIntelligenceOut>('league-intelligence');
    for (let week = 1; week <= initial.calendar.awardFromWeek; week += 1) await call('sim-week');
    await page.goto('/league');
    await page.getByTestId('to-races').click();
    await expect(page.getByTestId('award-candidates')).toBeVisible();
    await page.getByRole('combobox', { name: 'Award race' }).selectOption('OFFENSIVE_PLAYER');
    const first = (await call<LeagueIntelligenceOut>('league-intelligence')).races?.find((r) => r.code === 'OFFENSIVE_PLAYER')?.candidates[0];
    if (!first) throw new Error('No recorded candidates');
    await page.getByRole('button', { name: first.name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(first.name);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('award-candidates')).toBeVisible();
    await page.screenshot({ path: info.outputPath('award-races.png'), fullPage: true });
    for (let week = initial.calendar.awardFromWeek + 1; week <= initial.calendar.pictureFromWeek; week += 1) await call('sim-week');
    await page.goto('/league');
    await page.getByTestId('to-picture').click();
    await expect(page.getByTestId('picture-team-CLE')).toContainText('YOUR FRANCHISE');
    const tabs = page.getByRole('tablist', { name: 'Picture conference' }).getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await tabs.nth(1).click();
    await expect(page.getByText(/Current positions are not clinching/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('playoff-picture.png'), fullPage: true });
    await page.getByRole('button', { name: 'League hub', exact: true }).click();
    await page.getByTestId('to-rankings').click();
    await page.getByRole('combobox', { name: 'Ranking metric' }).selectOption('defense');
    await expect(page.getByTestId('ranking-rows').locator('[data-testid^="rank-team-"]')).toHaveCount(32);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('team-rankings.png'), fullPage: true });
    await page.getByTestId('rank-team-BUF').getByRole('button').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buffalo Stampede');
    await expect(page.getByText('Regular-season performance ranks')).toBeVisible();
  } finally {
    if (saveId !== undefined) await sql`delete from public.saves where id = ${saveId} and user_id = ${owner}`;
    await sql`delete from auth.users where id = ${owner}`;
    await sql.end();
  }
});
