import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, test, type Page } from '@playwright/test';
import { databaseUrl } from '../api/harness';
import { parseDatabaseUrl } from '../../supabase/functions/_shared/api/db';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { CampOut } from '../../supabase/functions/_shared/api/reads/camp';
import type { SaveOut } from '../../supabase/functions/_shared/api/reads/save';

// A separate owner per browser avoids the existing suites' shared slot races.
// Reach camp through the actual season and rollover routes; no mocked camp read.
test('a GM evaluates camp, confirms cuts and opens the next regular season', async ({ page, request }, info) => {
  test.setTimeout(900_000);
  const owner = randomUUID();
  const sql = postgres({ ...parseDatabaseUrl(databaseUrl()), max: 1 });
  let saveId: string | undefined;
  const call = async <T,>(route: string, input: Record<string, unknown> = {}): Promise<T> => {
    const response = await request.post('http://localhost:8787/' + route, {
      headers: { 'x-dev-user': owner }, data: { saveId, ...input }, timeout: 300_000,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return await response.json() as T;
  };
  try {
    await sql`insert into auth.users (id) values (${owner})`;
    const created = await call<CreateSaveOut>('create-save', {
      name: 'Camp journey', teamId: 'CLE', slot: 1, gmFirstName: 'Ari', gmLastName: 'Vale',
    });
    saveId = created.saveId;
    for (let guard = 0; guard < 25; guard += 1) {
      const current = (await call<SaveOut>('save')).save;
      if (current === null) throw new Error('Created save disappeared');
      if (!['REGULAR_SEASON', 'PLAYOFFS'].includes(current.phase)) break;
      await call('sim-week');
    }
    await call('advance-season');
    let board = await call<CampOut>('camp');
    expect(board.phase).toBe('TRAINING_CAMP');
    expect(board.cutsRemaining).toBeGreaterThan(0);

    await page.context().setExtraHTTPHeaders({ 'x-dev-user': owner });
    await page.addInitScript((id) => { localStorage.setItem('dmp.openSaveId', id); }, saveId);
    await page.goto('/team', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('to-camp').click();
    await expect(page.getByTestId('camp-header')).toContainText(String(board.rosterCount));
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('camp-overview.png'), fullPage: true });

    const battle = board.battles[0];
    if (battle === undefined) throw new Error('Generated camp has no position battle');
    await page.getByRole('button', { name: 'Compare ' + battle.group, exact: true }).click();
    await expect(page.getByTestId('camp-battles')).toContainText('contenders');
    const contender = battle.players[0];
    if (contender === undefined) throw new Error('Battle has no contender');
    await page.getByTestId('camp-player-list').getByTestId('camp-player-' + contender.playerId).getByRole('button').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(contender.name);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('camp-player-list')).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('camp-battle.png'), fullPage: true });

    await chooseView(page, 'Overview');
    await advance(page, 'PRESEASON');
    for (let week = 1; week <= board.preseasonWeeks; week += 1) {
      await advance(page, week === board.preseasonWeeks ? 'FINAL_CUTS' : 'PRESEASON');
    }
    await expect(page.getByTestId('camp-review')).toBeVisible();
    await expect(page.getByTestId('camp-finalize')).toBeDisabled();
    await expect(page.getByTestId('camp-advance-blocked')).toBeVisible();

    await chooseView(page, 'Cut decisions');
    await page.getByRole('tablist', { name: 'Camp position' }).getByRole('tab', { name: 'All', exact: true }).click();
    board = await call<CampOut>('camp');
    let cancelled = false;
    for (let guard = 0; board.cutsRemaining > 0 && guard < 60; guard += 1) {
      // Test-manager policy only: keep at least the server's projected group
      // allocation while choosing among surplus players. The UI chooses no cuts.
      const surplus = new Set(board.groups.filter((g) => g.count > g.projectedPlaces).map((g) => g.group));
      const victim = [...board.players].filter((p) => surplus.has(p.group))
        .sort((a, b) => b.depth - a.depth || a.overall - b.overall)[0];
      if (victim === undefined) throw new Error('No surplus player available for test-manager cut');
      await page.getByTestId('camp-cut-' + victim.playerId).click();
      const dialog = page.getByTestId('camp-cut-dialog');
      await expect(dialog).toContainText(victim.name);
      await expect(dialog).toContainText(String(board.rosterCount) + ' → ' + String(board.rosterCount - 1));
      await expect(page.getByTestId('camp-confirm-cut')).toBeEnabled();
      if (!cancelled) {
        await page.screenshot({ path: info.outputPath('camp-cut.png') });
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect((await call<CampOut>('camp')).rosterCount).toBe(board.rosterCount);
        await page.getByTestId('camp-cut-' + victim.playerId).click();
        cancelled = true;
      }
      const refreshed = page.waitForResponse((response) => response.url().endsWith('/camp')
        && response.request().method() === 'POST');
      await page.getByTestId('camp-confirm-cut').click();
      const fresh = await refreshed;
      expect(fresh.ok()).toBe(true);
      expect((await fresh.json() as CampOut).rosterCount).toBe(board.rosterCount - 1);
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId('camp-header')).toContainText(String(board.rosterCount - 1) + ' /');
      await expect(page.getByTestId('camp-cut-' + victim.playerId)).toHaveCount(0);
      board = await call<CampOut>('camp');
    }
    expect(board.rosterCount).toBe(board.rosterLimit);
    await chooseView(page, 'Final roster review');
    await expect(page.getByTestId('camp-review')).toContainText('Position distribution');
    await expect(page.getByTestId('camp-finalize')).toBeEnabled();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('camp-review.png'), fullPage: true });
    await page.getByTestId('camp-finalize').click();
    await page.getByTestId('camp-confirm-finalize').click();
    await expect(page.getByTestId('sim-week')).toBeVisible({ timeout: 30_000 });
    expect((await call<SaveOut>('save')).save?.phase).toBe('REGULAR_SEASON');
  } finally {
    if (saveId !== undefined) await sql`delete from public.saves where id = ${saveId} and user_id = ${owner}`;
    await sql`delete from auth.users where id = ${owner}`;
    await sql.end();
  }
});

async function chooseView(page: Page, name: string): Promise<void> {
  await page.getByRole('tablist', { name: 'Camp view' }).getByRole('tab', { name, exact: true }).click();
}

async function advance(page: Page, expected: string): Promise<void> {
  // Wait for the mutation response and refreshed board, not a fixed sleep.
  const response = page.waitForResponse((r) => r.url().endsWith('/advance-camp') && r.request().method() === 'POST');
  const refreshed = page.waitForResponse((r) => r.url().endsWith('/camp') && r.request().method() === 'POST');
  await page.getByTestId('camp-advance').click();
  const result = await response;
  expect(result.ok()).toBe(true);
  const out = await result.json() as { phase: string };
  expect(out.phase).toBe(expected);
  const fresh = await refreshed;
  expect(fresh.ok()).toBe(true);
  expect((await fresh.json() as CampOut).phase).toBe(expected);
  await expect(page.getByTestId('camp-header')).toBeVisible();
  if (expected !== 'FINAL_CUTS') await expect(page.getByTestId('camp-advance')).toBeEnabled();
}

async function noOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
