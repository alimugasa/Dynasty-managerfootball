import { expect, test, type Page } from '@playwright/test';

// The Trade Center, in a browser.
//
// The builder is the first screen in this game whose whole job is a *search*:
// a manager is hunting for the package that crosses a line they cannot see,
// and the only feedback they get is the meter. So these check the loop rather
// than the layout -- tick an asset, does the meter answer; offer it, is there
// a verdict a person can act on.

async function inDynasty(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Team', exact: true }).waitFor({ timeout: 120_000 });
}

async function ensureDynasty(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1 }).waitFor();
  if (await page.getByTestId('new-game').count() === 0) return;

  await page.getByTestId('load-game').click();
  await page.getByTestId('slot-list').waitFor({ timeout: 30_000 });
  const saved = page.getByTestId('slot-list').locator('[data-testid^="open-slot-"]').first();
  if (await saved.count() > 0) {
    await saved.click();
    await inDynasty(page);
    return;
  }
  await page.goBack();
  await page.getByTestId('new-game').click();
  await page.getByTestId('slot-list').waitFor({ timeout: 30_000 });
  await page.locator('[data-empty-slot] button').first().click();
  await page.getByTestId('gm-first').fill('Test');
  await page.getByTestId('gm-last').fill('Manager');
  await page.getByTestId('gm-continue').click();
  await page.getByTestId('club-list').waitFor({ timeout: 30_000 });
  await page.getByTestId('club-list').locator('[data-testid^="team-"]').first().click();
  await page.getByTestId('confirm-team').click();
  await page.getByTestId('setup-continue').click();
  await page.getByTestId('create-franchise').click();
  await inDynasty(page);
}

async function openTradeCenter(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByTestId('to-trades').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trade Center', { timeout: 30_000 });
}

test.describe('the trade centre', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240_000);
    await ensureDynasty(page);
  });

  test('says whether trading is open before it lists anything', async ({ page }) => {
    await openTradeCenter(page);
    const header = page.getByTestId('trade-header');
    await expect(header).toBeVisible({ timeout: 30_000 });
    // The six facts a trade turns on. Without them the clubs below are a list.
    for (const label of ['Trading', 'Deadline', 'Cap space', 'Picks', 'On the block', 'Roster']) {
      await expect(header).toContainText(label);
    }
  });

  test('shows every other club with a direction you can act on', async ({ page }) => {
    await openTradeCenter(page);
    // Wait for the section to settle before asking what is in it: the heading
    // is in the app bar and arrives before the data does, so counting straight
    // away counts an empty screen and calls it an empty league.
    const list = page.getByTestId('club-list');
    const shut = page.getByText('Trading is shut');
    await expect(list.or(shut).first()).toBeVisible({ timeout: 30_000 });
    if (await list.count() === 0) {
      // Trading shut: the screen says so instead of offering a dead builder.
      await expect(shut).toBeVisible();
      return;
    }
    const clubs = list.locator('[data-testid^="club-"]');
    await expect(clubs).toHaveCount(31);
    // A club's line says what it is trying to do, which is why you call it.
    await expect(clubs.first()).toContainText(/Contender|Playoff|Competitive|Retooling|Rebuild/);
  });

  test('answers as a package is built, and offers a verdict when it is put', async ({ page }) => {
    await openTradeCenter(page);
    const clubList = page.getByTestId('club-list');
    const closed = page.getByText('Trading is shut');
    await expect(clubList.or(closed).first()).toBeVisible({ timeout: 30_000 });
    if (await clubList.count() === 0) return;

    await page.getByTestId('club-list').locator('[data-testid^="club-"]').first().click();
    await expect(page.getByTestId('trade-builder')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('their-assets')).toBeVisible({ timeout: 30_000 });

    // Before anything is ticked there is no meter, and the screen says what to
    // do rather than showing an empty one.
    await expect(page.getByTestId('interest-meter')).toHaveCount(0);
    await expect(page.getByTestId('trade-builder')).toContainText('Pick at least one asset');

    // One from each side, and the meter answers.
    const theirs = page.getByTestId('their-assets').locator('button:not([disabled])').first();
    await theirs.click();
    const mine = page.getByTestId('my-assets').locator('button:not([disabled])').first();
    await mine.click();

    const meter = page.getByTestId('interest-meter');
    await expect(meter).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('interest-band'))
      .toHaveText(/No interest|Weak|Fair|Strong|Likely accept/);
    // A band with nothing under it is a score rather than a negotiation.
    const blocked = await page.getByTestId('trade-blocked').count();
    if (blocked === 0) await expect(page.getByTestId('trade-reasons')).toBeVisible();

    // Offering it produces an answer a person can act on.
    const offer = page.getByTestId('propose-trade');
    if (await offer.isEnabled()) {
      await offer.click();
      await expect(page.getByTestId('trade-answer')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('trade-answer')).not.toBeEmpty();
    }
  });

  test('lists a player from his profile, and says he noticed', async ({ page }) => {
    await page.getByRole('button', { name: 'Team', exact: true }).click();
    await page.getByTestId('to-roster').click();
    await page.getByTestId('depth-list').waitFor({ timeout: 30_000 });
    const first = page.getByTestId('depth-list').locator('button').first();
    await first.click();

    const toggle = page.getByTestId('toggle-block');
    if (await toggle.count() === 0) return;
    const before = await toggle.textContent();
    await toggle.click();
    await page.waitForTimeout(2500);
    // The button flips, which is the confirmation that anything happened.
    await expect(toggle).not.toHaveText(before ?? '', { timeout: 30_000 });
  });

  test('holds up on a phone', async ({ page }) => {
    await openTradeCenter(page);
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll('main button, main [role="tab"], main a, main input')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.height < 40) out.push(`${Math.round(b.height)}px "${(el.textContent ?? '').trim().slice(0, 24)}"`);
      }
      return [...new Set(out)];
    });
    expect(small, 'controls under 40px').toEqual([]);
  });
});
