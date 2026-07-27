import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Selectors below were read off the vendored source, not guessed — an
// earlier draft of this plan used ones that don't exist. `left-panel`,
// `chrono-item`, `dir-entry` (with `data-name`) come from Library.tsx;
// `sort-path`/`sort-recent`/`sort-relevance` from LibraryHeader.tsx;
// `fact-body` from FactBody.tsx; `#filter-input` from FilterBar.tsx;
// `retract-btn` from RightPanel.tsx. `edges-rail-slot` is ours (added in
// ExploreBrowser.tsx, Task 6) — EdgesRail itself has no root test id.

// The vendored Library defaults to librarySort 'recent', which renders
// `chrono-item` rows. The `dir-entry` tree only mounts under the Path or
// Relevance sorts (Library.tsx: `effectiveSort === 'path' || 'relevance'`),
// so tree tests must switch sorts first.
async function showTree(page: Page) {
  await page.getByTestId('sort-path').click();
  await expect(page.getByTestId('dir-entry').first()).toBeVisible();
}

/** Open the first fact in the default Recent list. */
async function openFirstFact(page: Page) {
  const row = page.getByTestId('chrono-item').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId('fact-body')).toBeVisible();
}

test.describe('/explore live KB browser', () => {
  test('renders the browser and its library', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByTestId('explore-browser')).toBeVisible();
    await expect(page.getByTestId('left-panel')).toBeVisible();
    await expect(page.getByTestId('chrono-item').first()).toBeVisible();
  });

  test('descends the ontology tree under the Path sort', async ({ page }) => {
    await page.goto('/explore');
    await showTree(page);

    const dir = page.getByTestId('dir-entry').first();
    const name = await dir.getAttribute('data-name');
    await dir.click();

    // Descending changes the level: either new directories or fact leaves.
    await expect(page.getByTestId('dir-entry').first()).toBeVisible();
    await expect(page.locator(`[data-testid="dir-entry"][data-name="${name}"]`)).toHaveCount(0);
  });

  test('opens a fact and shows its body', async ({ page }) => {
    await page.goto('/explore');
    await openFirstFact(page);
    await expect(page.getByTestId('fact-body')).not.toBeEmpty();
  });

  test('shows the connections rail only while a fact is open', async ({ page }) => {
    await page.goto('/explore');
    // Library.tsx's Recent-mode effect auto-opens the first fact as soon as
    // it loads (`AMEND_NAV` when the list is non-empty and nothing else is
    // open yet), so a fact — and the rail — is already open by the time the
    // page settles; there's no reachable "just loaded, nothing open" DOM
    // state to assert against. Use ExploreBrowser's own Escape shortcut
    // (`CLEAR_FILTERS`, which explicitly nulls `factPath`) to close it, then
    // confirm the rail goes with it and comes back on reopen.
    await expect(page.getByTestId('chrono-item').first()).toBeVisible();
    await expect(page.getByTestId('edges-rail-slot')).toBeVisible();

    await page.getByTestId('explore-browser').press('Escape');
    await expect(page.getByTestId('edges-rail-slot')).toHaveCount(0);

    await openFirstFact(page);
    await expect(page.getByTestId('edges-rail-slot')).toBeVisible();
  });

  test('exposes no write controls', async ({ page }) => {
    await page.goto('/explore');
    await openFirstFact(page);
    // RightPanel.tsx always renders a retract control (`onRetract` is always
    // passed); with `serverReadOnly: true` it must render disabled rather
    // than absent. Assert on the disabled attribute itself — the button's
    // accessible name is its `title` ("Read-only — anchor is not live" when
    // disabled), which a role-name match for /^retract$/i would never catch,
    // disabled or not, so that alone can't prove read-only is enforced.
    await expect(page.getByTestId('retract-btn')).toBeDisabled();
    // FactEditor (with textual Save/Cancel buttons) only mounts for a fact
    // with a parse error, which the opened fact doesn't have — so this is a
    // belt-and-suspenders check, not the load-bearing one above.
    await expect(page.getByRole('button', { name: /^(edit|save)$/i })).toHaveCount(0);
  });

  test('filters the recent list via a path chip', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByTestId('chrono-item').first()).toBeVisible();
    const before = await page.getByTestId('chrono-item').count();

    // A `path:` chip is deliberately NOT a "domain/entity/type/kind/origin"
    // chip: Library.tsx's `hasNonPathFilters` excludes it, so librarySort
    // stays 'recent' and the list keeps rendering as `chrono-item` rows —
    // unlike e.g. a `type:` chip, which flips `effectiveSort` to 'relevance'
    // and swaps the whole list over to `dir-entry` rows regardless of
    // whether the filter actually matched anything (a vacuous "count went
    // to 0" either way). Scoping to `kb/gotchas` — one of the KB's fixed
    // ontology topics, and a strict subset of the full `kb` root — narrows
    // `api.recent`'s `path` argument and genuinely shrinks the list.
    await page.locator('#filter-input').fill('path:kb/gotchas');
    await page.locator('#filter-input').press('Enter');

    await expect(page.getByTestId('left-panel')).toHaveAttribute('data-sort', 'recent');
    await expect.poll(() => page.getByTestId('chrono-item').count())
      .toBeLessThan(before);
  });

  test('falls back to the teaser when the bundle is unavailable', async ({ page }) => {
    await page.route('**/kb/bundle-*.json', route => route.fulfill({ status: 404, body: '' }));
    await page.goto('/explore');
    // ExploreBrowser's Fallback() adds `explore-fallback` to <body>, and
    // explore.astro's CSS reacts to that class by hiding `.explore-live` (the
    // island's own ancestor) and showing `.explore-teaser` instead — so the
    // `explore-fallback` marker span is real but sits inside the very
    // container its own class just hid; assert it's present, not visible.
    await expect(page.locator('body')).toHaveClass(/explore-fallback/);
    await expect(page.getByTestId('explore-fallback')).toHaveCount(1);
    await expect(page.getByTestId('explore-teaser')).toBeVisible();
    await expect(page.getByTestId('explore-browser')).toHaveCount(0);
  });
});
