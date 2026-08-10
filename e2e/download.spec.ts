import { test, expect } from '@playwright/test';

// /download renders from src/generated/release.json, which scripts/sync.mjs
// writes from the GitHub releases API at build time. These assertions are
// deliberately version-AGNOSTIC: the page's whole point is that it tracks
// whatever the latest stable release is, so pinning "0.5.2" here would turn
// the next release into a red suite.

test.describe('/download', () => {
  test('offers a desktop build and a server build per platform', async ({ page }) => {
    await page.goto('/download');

    const grid = page.getByTestId('download-grid');
    await expect(grid).toBeVisible();

    // Both platforms the release pipeline builds for. Named cards rather than
    // a count, so adding a third platform upstream doesn't fail this.
    await expect(grid.locator('[data-platform="macos"]')).toBeVisible();
    await expect(grid.locator('[data-platform="linux"]')).toBeVisible();

    await expect(page.getByTestId('download-desktop')).toHaveCount(2);
    await expect(page.getByTestId('download-server')).toHaveCount(2);
  });

  test('every download points at a real release asset on GitHub', async ({ page }) => {
    await page.goto('/download');
    const links = page.locator('[data-testid^="download-"]');
    const hrefs = await links.evaluateAll(els =>
      els.map(e => e.getAttribute('href')).filter((h): h is string => !!h));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      // The versioned per-asset form. `releases/latest/download/` would be a
      // BUG here, not an equivalent: it resolves by exact filename, and these
      // filenames carry the version, so the shortcut cannot address them.
      expect(href).toMatch(
        /^https:\/\/github\.com\/knomit\/knomit\/releases\/download\/v[\d.]+\/\S+$/);
    }
  });

  test('states the platform-specific update behaviour', async ({ page }) => {
    await page.goto('/download');
    const body = page.locator('body');
    // Self-update is macOS-only, and saying so is the point of the section —
    // a reader must not infer that the AppImage updates itself too.
    await expect(body).toContainText('macOS builds keep themselves current');
    await expect(body).toContainText('Linux does not self-update yet');
    // The irreversibility warning is the one line here with real consequences.
    await expect(body).toContainText('migrations do not reverse');
  });

  test('tells you how to verify what you downloaded', async ({ page }) => {
    await page.goto('/download');
    await expect(page.locator('body')).toContainText('.ed25519');
    await expect(page.locator('body')).toContainText('shasum -a 256');
  });

  test('is reachable from the homepage hero and the header', async ({ page }) => {
    await page.goto('/');
    // The hero's PRIMARY action. `.k-btn:not(.k-btn--ghost)` is what makes it
    // primary in this design system, so asserting the class is asserting the
    // decision — a demotion to ghost would pass a bare href check.
    const heroCta = page.locator('.hero__cta a[href="/download"]');
    await expect(heroCta).toHaveCount(1);
    await expect(heroCta).not.toHaveClass(/k-btn--ghost/);

    // The row must not wrap. The hero column is ~520px, so a third button
    // pushes one onto a second line and the primary action stops reading as
    // primary. One row of buttons is ~46px; two are ~110px, so 70px separates
    // them with room for padding changes on either side.
    const row = (await page.locator('.hero__cta').boundingBox())!;
    expect(row.height, 'hero CTA row wrapped onto a second line').toBeLessThan(70);

    // The header carries two: the desktop actions button and the burger
    // menu's link. Both are always in the DOM and CSS picks one by viewport,
    // so assert on what a visitor can actually see rather than on the count.
    await expect(page.locator('header a[href="/download"]:visible')).toHaveCount(1);
  });
});
