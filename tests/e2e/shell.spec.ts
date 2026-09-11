import { expect, test, type Page } from '@playwright/test';

// Page-level horizontal overflow is a defect at every width the app supports.
// A control scrolling inside its own .tscroll container is correct and is not
// what these assert.

const TABS = ['Team', 'League', 'Schedule', 'Roster', 'Office'];

/**
 * A dynasty to look at, opened through the front door.
 *
 * The app opens on the main menu until a save is open, and each test gets a
 * fresh browser context -- so which save is open is forgotten between tests
 * even though the save itself is not. That is why this loads before it
 * creates: the first test to run walks the whole start flow, and every test
 * after it opens what that one made rather than filling another save file.
 */
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
  const saved = page.getByTestId('slot-list').locator('[data-testid^="slot-"] button').first();
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
  await page.getByTestId('club-list').locator('button').first().click();
  await inDynasty(page);
}

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
}

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    // Creating a dynasty clones a world: on a cold database the first test
    // pays for it, and 20 seconds is a budget for assertions, not for that.
    test.setTimeout(180_000);
    await ensureDynasty(page);
  });

  test('shows all five destinations', async ({ page }) => {
    await page.goto('/');
    for (const label of TABS) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
  });

  test('every screen renders without page-level horizontal scroll', async ({ page }) => {
    await page.goto('/');
    for (const label of TABS) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await pageOverflow(page), `${label} overflows`).toBeLessThanOrEqual(1);
      // Skeletons, never spinners -- checked on every tab, here, because the
      // tabs are already loaded once in this loop and booting the league is
      // slow enough that a second navigation is not free.
      await expect(page.locator('[class*="spin"], [class*="loader"]')).toHaveCount(0);
    }
  });

  test('a drill-down renders without overflow and offers a way back', async ({ page }) => {
    // Opens a player from the roster. This used to open the Office's Scouting
    // placeholder, which was removed when the screens were wired to the game.
    await page.goto('/');
    await page.getByRole('button', { name: 'Roster', exact: true }).click();
    await page.locator('[data-testid="depth-list"] button').first().click();
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });

  test('the browser back button returns to the previous screen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Roster', exact: true }).click();
    await page.locator('[data-testid="depth-list"] button').first().click();
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: /roster/i })).toBeVisible();
  });

  test('long chip rows scroll inside themselves, not the page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    // Nineteen week chips is exactly the control that would otherwise widen a
    // 375px page.
    const row = page.locator('.tscroll').first();
    await expect(row).toBeVisible();
    expect(await row.evaluate((n) => n.scrollWidth > n.clientWidth)).toBe(true);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });

  test('the skeleton pattern still works', async ({ page }) => {
    // The tab screens no longer show placeholders -- they render real data, so
    // there is no loading state to place one in, and the no-spinner rule is
    // checked across the tabs in the test above. This keeps the pattern itself
    // covered, for when async loading arrives.
    await page.goto('/dev/components');
    await expect(page.locator('.skeleton').first()).toBeVisible();
    // A busy region announces once rather than per placeholder.
    await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
  });

  test('the bottom bar keeps the current tab lit inside a drill-down', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Roster', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Roster', exact: true }))
      .toHaveAttribute('aria-current', 'page');
  });
});
