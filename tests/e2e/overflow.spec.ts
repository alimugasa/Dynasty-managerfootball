import { expect, test } from '@playwright/test';

// Page-level horizontal overflow is a defect at every width. Tables scrolling
// inside their own containers is correct and is not what this asserts.
for (const path of ['/', '/dev/components']) {
  test(`no page-level horizontal overflow at ${path}`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
}

test('wide table scrolls inside its own container', async ({ page }) => {
  await page.goto('/dev/components');
  // Named rather than positional: the gallery has several scrollers now, and
  // only this one is guaranteed wider than every supported viewport.
  const scroller = page.getByTestId('wide-table').locator('.tscroll');
  await expect(scroller).toBeVisible();
  const canScroll = await scroller.evaluate((n) => n.scrollWidth > n.clientWidth);
  expect(canScroll).toBe(true);
});
