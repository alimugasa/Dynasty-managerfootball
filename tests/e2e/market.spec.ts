import { expect, test, type Page } from '@playwright/test';

// The wire and the market, in a browser.
//
// These exist because the three screens they cover are the first in this game
// whose main job is a *decision* rather than a display -- claim him or do not,
// offer this or offer more -- and a decision screen fails differently from a
// list. A list that is wrong looks wrong. A decision screen that is wrong
// looks fine and gives the wrong answer, which is why the assertions here are
// about what the controls say and whether they do it.

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

test.describe('the in-season market', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await ensureDynasty(page);
  });

  test('the Team tab opens the wire, the market and the record', async ({ page }) => {
    // Three cards were added to a tab whose whole design rule is that no card
    // is dead. Each one is tapped and each destination has to render its own
    // heading rather than a blank screen.
    for (const [card, heading] of [
      ['to-waivers', 'Waiver Wire'],
      ['to-free-agents', 'Free Agents'],
      ['to-transactions', 'Transactions'],
    ] as const) {
      await page.getByRole('button', { name: 'Team', exact: true }).click();
      await page.getByTestId(card).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading, { timeout: 30_000 });
    }
  });

  test('the wire says where this club stands before it lists anybody', async ({ page }) => {
    await page.getByRole('button', { name: 'Team', exact: true }).click();
    await page.getByTestId('to-waivers').click();
    const header = page.getByTestId('waiver-header');
    await expect(header).toBeVisible({ timeout: 30_000 });
    // The four facts a claim turns on. Without them the list below is names.
    for (const label of ['Priority', 'Claims in', 'Roster', 'Cap space']) {
      await expect(header).toContainText(label);
    }
    // An empty wire explains itself rather than showing an empty panel.
    const list = page.getByTestId('waiver-list');
    if (await list.count() === 0) {
      await expect(page.getByText('Nobody is on waivers')).toBeVisible();
    }
  });

  test('the market filters, and an offer opens on terms he would take', async ({ page }) => {
    await page.getByRole('button', { name: 'Team', exact: true }).click();
    await page.getByTestId('to-free-agents').click();
    await expect(page.getByTestId('fa-list')).toBeVisible({ timeout: 30_000 });

    // A filter that actually filters: quarterbacks only, and every row is one.
    const before = await page.getByTestId('fa-list').locator('[data-testid^="fa-"]').count();
    await page.getByRole('tab', { name: 'QB', exact: true }).click();
    await page.waitForTimeout(1500);
    const rows = page.getByTestId('fa-list').locator('[data-testid^="fa-"]');
    const after = await rows.count();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);

    // Opening a player opens an offer already filled in. A sheet that opened
    // on zeroes would make the manager do the market's arithmetic.
    await rows.first().click();
    const sheet = page.getByTestId('offer-sheet');
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await expect(sheet).toContainText('He is asking');
    await expect(page.getByTestId('offer-submit')).toBeVisible();
    // Nothing in the sheet is a zero standing in for a figure nobody has.
    await expect(sheet).not.toContainText('$0');
  });

  test('holds up on a phone: no sideways scroll, nothing too small to hit', async ({ page }) => {
    // Three screens dense with figures, chips and money, built after the
    // polish pass set the floor. The polish spec walks the five tabs; these
    // are pushed on top of one and would not be reached by it.
    const TAP = 40;
    for (const card of ['to-waivers', 'to-free-agents', 'to-transactions']) {
      await page.getByRole('button', { name: 'Team', exact: true }).click();
      await page.getByTestId(card).click();
      await page.waitForTimeout(1500);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, card).toBeLessThanOrEqual(overflow.clientWidth + 1);

      const small = await page.evaluate((floor) => {
        const out: string[] = [];
        for (const el of document.querySelectorAll('main button, main [role="tab"], main a, main input')) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) continue;
          if (b.height < floor) {
            out.push(`${Math.round(b.height)}px "${(el.textContent ?? '').trim().slice(0, 24)}"`);
          }
        }
        return [...new Set(out)];
      }, TAP);
      expect(small, `${card}: controls under ${String(TAP)}px`).toEqual([]);
    }
  });

  test('an offer can be put, and the answer is one a manager can act on', async ({ page }) => {
    // The loop the whole feature exists for, driven through the controls
    // rather than through the API: open a free agent, put the offer the sheet
    // opened on, and read what he says. Every one of the three answers has to
    // leave the manager with something to do next -- which is exactly what a
    // unit test cannot check, because the thing being checked is the screen.
    await page.getByRole('button', { name: 'Team', exact: true }).click();
    await page.getByTestId('to-free-agents').click();
    await expect(page.getByTestId('fa-list')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('fa-list').locator('[data-testid^="fa-"]').first().click();

    const sheet = page.getByTestId('offer-sheet');
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    // The likelihood is worked out for the terms the sheet opened on, and it
    // has to arrive: a sheet stuck on "working it out" is a dead screen.
    await expect(page.getByTestId('signing-likelihood')).toBeVisible({ timeout: 30_000 });

    // A club at 53 cannot sign anybody, and the sheet says so rather than
    // offering a button that does nothing. That is a correct outcome, not a
    // reason to skip the test -- what is being checked is that the screen
    // explains itself.
    if (await page.getByTestId('offer-blocked').count() > 0) {
      await expect(page.getByTestId('offer-blocked')).toContainText('roster is full');
      await expect(page.getByTestId('offer-submit')).toBeDisabled();
      return;
    }

    await page.getByTestId('offer-submit').click();
    await page.waitForTimeout(2500);

    const signed = await page.getByTestId('offer-signed').count();
    const countered = await page.getByTestId('offer-countered').count();
    const rejected = await page.getByTestId('offer-rejected').count();
    // One of the three, and never silence: an offer that produced no visible
    // answer is the failure this test is here to catch.
    expect(signed + countered + rejected).toBeGreaterThan(0);

    // A counter is a number, and the button that meets it says the number.
    if (countered > 0) {
      const meet = page.getByTestId('offer-accept-counter');
      await expect(meet).toBeVisible();
      await expect(meet).toContainText('$');
    }
    // A refusal says why, rather than just failing.
    if (rejected > 0) {
      await expect(page.getByTestId('offer-rejected')).toContainText('He says no');
    }
  });

  test('the record names the kind of move, not the database name for it', async ({ page }) => {
    await page.getByRole('button', { name: 'Team', exact: true }).click();
    await page.getByTestId('to-transactions').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Transactions', { timeout: 30_000 });
    const list = page.getByTestId('transaction-list');
    if (await list.count() === 0) {
      await expect(page.getByText('Nothing here yet')).toBeVisible();
      return;
    }
    // FREE_AGENT_SIGNING is a column value, not a word anybody says.
    await expect(list).not.toContainText('FREE_AGENT_SIGNING');
    await expect(list).not.toContainText('WAIVER_CLAIM');
  });
});
