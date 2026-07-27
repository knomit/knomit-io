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
    // The shell deliberately leaves `serverReadOnly` false, because upstream
    // overloads that flag to also disable click-to-filter (see the next
    // test). So RightPanel renders its retract control as usual and
    // explore.astro hides it. `toBeHidden` — not `toBeDisabled` — is the
    // assertion that matches: display:none keeps it out of the
    // accessibility tree, so a keyboard user can't reach it either.
    await expect(page.getByTestId('retract-btn')).toBeHidden();
    // FactEditor (with textual Save/Cancel buttons) only mounts for a fact
    // with a parse error, which the opened fact doesn't have.
    await expect(page.getByRole('button', { name: /^(edit|save)$/i })).toHaveCount(0);
  });

  test('clicking a domain chip adds it to the filter', async ({ page }) => {
    await page.goto('/explore');
    await openFirstFact(page);
    // Regression guard for the `serverReadOnly` trade-off above. FactBody
    // gates these chips on the same `readOnly` boolean as the write
    // controls, so re-introducing serverReadOnly silently turns
    // click-to-filter into a no-op — the UI still renders the chips, they
    // just stop doing anything.
    const chip = page.locator('.explore-frame__content span')
      .filter({ hasText: /^agentic-engineering$/ }).first();
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page.locator('#filter-input').locator('..').locator('..'))
      .toContainText('domain:agentic-engineering');
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

// ── Guided tour ─────────────────────────────────────────────────────────────
// The tour drives the real reducer, so these assertions double as coverage of
// the underlying operations: filtering, opening a fact, hopping an edge in
// both directions, and time-travel. A step that silently stopped working
// (which is how the last two tour bugs presented — the narration advanced
// while nothing happened behind it) fails here.
test.describe('/explore guided tour', () => {
  test('invites on a first visit, and only once', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByTestId('tour-invite')).toBeVisible();
    await page.getByTestId('tour-dismiss').click();
    await expect(page.getByTestId('tour-invite')).toHaveCount(0);
    // Dismissing must not make it unreachable — the launcher is the way back.
    await expect(page.getByTestId('tour-launcher')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('tour-invite')).toHaveCount(0);
    await expect(page.getByTestId('tour-launcher')).toBeVisible();
  });

  test('walks every step, driving the real UI', async ({ page }) => {
    await page.goto('/explore');
    await page.getByTestId('tour-start').click();

    const bar = page.getByTestId('tour-bar');
    const frame = page.locator('.explore-frame');
    const next = () => page.getByTestId('tour-next').click();

    // 1 — chronological. Asserted, not assumed: the tour can be restarted
    // after the visitor has changed the sort themselves.
    await expect(bar).toContainText('1/8');
    await expect(page.getByTestId('left-panel')).toHaveAttribute('data-sort', 'recent');
    await expect(frame).toHaveAttribute('data-tour-highlight', 'library');

    // 2 — ontological. A separate step so the switch is something you watch
    // happen, rather than a state you arrive in already explained.
    await next();
    await expect(bar).toContainText('2/8');
    await expect(page.getByTestId('left-panel')).toHaveAttribute('data-sort', 'path');

    // 3 — a real filter chip lands, and the sort flips to relevance.
    await next();
    await expect(page.getByTestId('left-panel')).toHaveAttribute('data-sort', 'relevance');

    // 4 — a fact is open.
    await next();
    await expect(page.getByTestId('fact-title')).toBeVisible();
    await expect(frame).toHaveAttribute('data-tour-highlight', 'fact');

    // 5 — hopped down an edge; the rail is the highlight.
    await next();
    await expect(frame).toHaveAttribute('data-tour-highlight', 'edges');
    await expect(page.getByTestId('edges-rail-slot')).toBeVisible();

    // 6 — time-travel: the filter input is replaced by the trail breadcrumb,
    // which is how we know the anchor really left live.
    await next();
    await expect(bar).toContainText('6/8');
    await expect(page.locator('#filter-input')).toHaveCount(0);

    // 7 — back up the edge AND back to live. Regression guard: a stale-ref
    // race used to leave this pinned in history, which stranded the last step.
    await next();
    await expect(page.locator('#filter-input')).toHaveCount(1);

    // 8 — the entity filter stacks on the type filter from step 3.
    await next();
    await expect(bar).toContainText('8/8');
    await expect(frame).toHaveAttribute('data-tour-highlight', 'filter');
    await expect(frame).toContainText('entity:');

    // Done clears up after itself.
    await next();
    await expect(bar).toHaveCount(0);
    await expect(page.getByTestId('tour-launcher')).toBeVisible();
  });

  test('starting the tour keeps the open fact until the view actually changes', async ({ page }) => {
    await page.goto('/explore');
    // Library auto-opens the first fact in chronological mode.
    await expect(page.getByTestId('fact-title')).toBeVisible();
    const opened = await page.getByTestId('fact-title').textContent();

    await page.getByTestId('tour-start').click();

    // Step 1 only describes the chronological view — it must not disturb it.
    // SET_LIBRARY_SORT nulls factPath by design, so dispatching it as a no-op
    // "assert the default" used to close the fact and drop the visitor onto
    // the repo stats view the instant they started the tour.
    await expect(page.getByTestId('tour-bar')).toContainText('1/8');
    await expect(page.getByTestId('fact-title')).toHaveText(opened!);
    await expect(page.getByTestId('stats-view')).toHaveCount(0);

    // Step 2 genuinely switches views, and losing the selection is correct.
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('left-panel')).toHaveAttribute('data-sort', 'path');
  });

  test('animates a pointer to the control before performing each step', async ({ page }) => {
    await page.goto('/explore');
    await page.getByTestId('tour-start').click();
    await expect(page.getByTestId('tour-bar')).toContainText('1/8');

    // No pointer until a transition is requested.
    await expect(page.getByTestId('tour-cursor')).toHaveCount(0);

    await page.getByTestId('tour-next').click();
    // It travels to the control that causes step 2 — the Path sort toggle —
    // and the step has NOT run yet while it is in flight.
    const cursor = page.getByTestId('tour-cursor');
    await expect(cursor).toBeVisible();
    // Assert the DESTINATION, read from the inline transform, not a measured
    // box: the transform is set to the endpoint immediately and the CSS
    // transition animates toward it, so this is deterministic — whereas
    // boundingBox() samples wherever the pointer happens to be in flight.
    // Both the transform and the computed target are frame-relative.
    const transform = await cursor.evaluate(el => (el as HTMLElement).style.transform);
    const [, tx, ty] = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform)!;
    const target = (await page.getByTestId('sort-path').boundingBox())!;
    const frame = (await page.locator('.explore-frame').boundingBox())!;
    expect(Math.abs(Number(ty) - (target.y - frame.y + target.height / 2))).toBeLessThan(12);
    expect(Math.abs(Number(tx) - (target.x - frame.x + Math.min(target.width / 2, 40))))
      .toBeLessThan(12);

    // Then the action lands and the pointer is removed.
    await expect(page.getByTestId('left-panel')).toHaveAttribute('data-sort', 'path');
    await expect(page.getByTestId('tour-cursor')).toHaveCount(0);
    await expect(page.getByTestId('tour-next')).toBeEnabled();
  });

  test('impatient clicking during the animation cannot skip a step', async ({ page }) => {
    await page.goto('/explore');
    await page.getByTestId('tour-start').click();
    await expect(page.getByTestId('tour-bar')).toContainText('1/8');

    // dispatchEvent, not click(): click() waits for the button to become
    // enabled, which would defeat the point. These fire while it is disabled.
    const next = page.getByTestId('tour-next');
    await next.click();
    for (let i = 0; i < 4; i++) await next.dispatchEvent('click');

    await expect(page.getByTestId('left-panel')).toHaveAttribute('data-sort', 'path');
    // One step, not five — the busy guard swallowed the extra clicks rather
    // than queueing them, which would have raced several steps' dispatches.
    await expect(page.getByTestId('tour-bar')).toContainText('2/8');
  });

  test('the launcher names the real repo and links to it', async ({ page }) => {
    await page.goto('/explore');
    await page.getByTestId('tour-dismiss').click();
    const launcher = page.getByTestId('tour-launcher');
    // Typographic apostrophes in the copy (&rsquo;), so match around them.
    await expect(launcher).toContainText(/browsing/);
    await expect(launcher).toContainText(/own web UI, served as a static snapshot/);
    await expect(launcher).toContainText(/147 facts, 83 commits of history/);
    // Label and href both derive from bundle.repo, so this catches a
    // retargeted KB_REPO_SLUG leaving the link pointing at the old repo.
    const link = launcher.getByRole('link');
    await expect(link).toHaveText('agentic-engineering-kb');
    await expect(link).toHaveAttribute('href', 'https://github.com/knomit/agentic-engineering-kb');
  });
});
