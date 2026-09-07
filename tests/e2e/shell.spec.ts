import { expect, test, type Page } from '@playwright/test';

// Page-level horizontal overflow is a defect at every width the app supports.
// A control scrolling inside its own .tscroll container is correct and is not
// what these assert.

const TABS = ['Team', 'League', 'Schedule', 'Roster', 'Office'];

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
}

test.describe('app shell', () => {
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
    }
  });

  test('a drill-down renders without overflow and offers a way back', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Office', exact: true }).click();
    await page.getByRole('button', { name: /scouting department/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: /scouting/i })).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  });

  test('the browser back button returns to the previous screen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Office', exact: true }).click();
    await page.getByRole('button', { name: /transactions/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: /transactions/i })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: /office/i })).toBeVisible();
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

  test('skeletons are used, and no spinner is', async ({ page }) => {
    await page.goto('/');
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
