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
  const scroller = page.locator('.tscroll').first();
  await expect(scroller).toBeVisible();
  const canScroll = await scroller.evaluate((n) => n.scrollWidth > n.clientWidth);
  expect(canScroll).toBe(true);
});
