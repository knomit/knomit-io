import { test, expect } from '@playwright/test';

test.describe('meta descriptions', () => {
  const pages = ['/', '/concepts', '/use-cases', '/blog'];
  for (const path of pages) {
    test(`${path} has a meta description <= 160 chars`, async ({ page }) => {
      await page.goto(path);
      const desc = await page
        .locator('head meta[name="description"]')
        .getAttribute('content');
      expect(desc, `${path} missing meta description`).toBeTruthy();
      expect(desc!.length, `${path} description too long: ${desc!.length}`).toBeLessThanOrEqual(160);
    });
  }
});
