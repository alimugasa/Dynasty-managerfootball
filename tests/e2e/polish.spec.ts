import { expect, test, type Page } from '@playwright/test';

// The guarantees a polish pass leaves behind.
//
// Its own file rather than more of shell.spec.ts, which is already at the
// architecture check's line ceiling -- and because these two assert something
// different from the rest of the suite. The shell tests ask whether a screen
// works; these ask whether it is usable: whether a control can be hit with a
// thumb, and whether a screen that fails gives you anywhere to go.
//
// Both are regression guards for defects that looked fine. A 32px chip and a
// red box with no buttons are the kind of thing that ships, because nothing
// about either is broken -- they are merely worse than they should be, and
// only a measurement notices.

/**
 * In a dynasty, whatever phase it is in.
 *
 * The bottom navigation is the signal, not a button on the Team screen: the
 * tab bar renders for every in-game phase and for none of the boot screens,
 * while "Sim week" exists only while there is football left to play. Waiting
 * on that button hung the moment a save was parked in the offseason -- which
 * it silently was not before, because the Team screen used to mistake AWARDS
 * for a week that could still be simulated.
 */
async function inDynasty(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Team', exact: true }).waitFor({ timeout: 120_000 });
}

async function ensureDynasty(page: Page): Promise<void> {
  // domcontentloaded: the load event waits on the font stylesheet, which a
  // proxy that black-holes fonts.googleapis.com holds for the full timeout.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1 }).waitFor();
  if (await page.getByTestId('new-game').count() === 0) return;

  await page.getByTestId('load-game').click();
  await page.getByTestId('slot-list').waitFor({ timeout: 30_000 });
  // The button that opens a save, by name: a filled card also carries an
  // overflow menu, and that one comes first in the DOM.
  const saved = page.getByTestId('slot-list').locator('[data-testid^="open-slot-"]').first();
  if (await saved.count() > 0) {
    await saved.click();
    await inDynasty(page);
    return;
  }

  // Nothing saved yet. Walk it: New Game, a save file, a GM, a club.
  await page.goBack();
  await page.getByTestId('new-game').click();
  await page.getByTestId('slot-list').waitFor({ timeout: 30_000 });
  await page.locator('[data-empty-slot] button').first().click();
  await page.getByTestId('gm-first').fill('Test');
  await page.getByTestId('gm-last').fill('Manager');
  await page.getByTestId('gm-continue').click();
  await page.getByTestId('club-list').waitFor({ timeout: 30_000 });
  // Picking a club opens its scouting report, which leads to the rules it is
  // played under and then to the confirmation; that last screen is the only one
  // in the flow that writes.
  await page.getByTestId('club-list').locator('[data-testid^="team-"]').first().click();
  await page.getByTestId('confirm-team').click();
  await page.getByTestId('setup-continue').click();
  // Create Franchise hands over to the world screen, which runs the single
  // call that writes the league and then opens the front office.
  await page.getByTestId('create-franchise').click();
  await inDynasty(page);
}


test.describe('polish', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await ensureDynasty(page);
  });

  test('every control on a tab is big enough to hit with a thumb', async ({ page }) => {
    // The audit that prompted this found filter chips at 32px, a save file's
    // overflow menu at 34, a compact button at 34, and the team name in a
    // standings row at 15 -- a control the size of its own text, in a
    // thirty-two row table, on a phone. All of those looked fine and missed.
    //
    // It runs on the real screens rather than on a component in isolation,
    // because the regressions were all in how a control was placed rather than
    // in how it was built: the standings button was sized correctly and sat in
    // a cell it did not fill.
    await page.goto('/');
    const TAP = 40;
    for (const tab of ['Office', 'Team', 'Play', 'League', 'News']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(1200);
      const small = await page.evaluate((floor) => {
        const out: string[] = [];
        for (const el of document.querySelectorAll('main button, main [role="button"], main a, main input')) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) continue;
          if (b.height < floor) {
            out.push(`${Math.round(b.height)}px "${(el.getAttribute('aria-label')
              ?? el.textContent ?? '').trim().slice(0, 30)}"`);
          }
        }
        return [...new Set(out)];
      }, TAP);
      expect(small, `${tab}: controls under ${String(TAP)}px`).toEqual([]);
    }
  });

  test('a failed read explains itself and offers a way on', async ({ page }) => {
    // An error state used to be a red box and the server's message, which is a
    // dead end wearing an explanation. Every query-backed screen can now be
    // asked to try again.
    await page.goto('/');
    await page.route('**/roster', (route) => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'internal', message: 'Simulated read failure.' }),
    }));
    await page.getByRole('button', { name: 'Team', exact: true }).click();
    await page.getByTestId('to-roster').click();

    const error = page.getByTestId('query-error');
    await expect(error).toBeVisible({ timeout: 30_000 });
    // What failed, in the server's own words, and both ways out.
    await expect(error).toContainText('Simulated read failure.');
    await expect(page.getByTestId('query-retry')).toBeVisible();
    await expect(page.getByTestId('query-back')).toBeVisible();

    // Retry actually re-reads: let the route through, tap it, and the roster
    // arrives where the error was.
    await page.unroute('**/roster');
    await page.getByTestId('query-retry').click();
    await expect(page.getByTestId('depth-list')).toBeVisible({ timeout: 30_000 });
    await expect(error).toHaveCount(0);
  });

});
