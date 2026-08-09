import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Selectors below were read off the vendored source, not guessed — an
// earlier draft of this plan used ones that don't exist. `left-panel`,
// `chrono-item`, `dir-entry` (with `data-name`) come from Library.tsx;
// `sort-path`/`sort-recent`/`sort-relevance` from LibraryHeader.tsx;
// `fact-body` from FactBody.tsx; `#filter-input` from FilterBar.tsx;
// `retract-btn` from RightPanel.tsx; `connections-in`/`connections-out` from
// ConnectionsMenu.tsx. The last two replaced our own `edges-rail-slot` when
// v0.5.2 retired EdgesRail: connections are edge-count cells in the fact
// header now, so upstream owns the hook and we no longer add one.

// The vendored Library defaults to librarySort 'path' as of v0.5.2 (state.ts
// `init`; it was 'recent' before), so the landing view is the `dir-entry`
// ontology tree with the folder overview — highlights and facets — beside it,
// and NO fact open. `chrono-item` rows only render under the Recent sort, so
// any test that wants them has to ask for it.
//
// Both helpers switch sorts explicitly rather than relying on the default.
// That default has now changed once under `npm run sync`, silently breaking
// eight assertions at a distance; asking for the mode a test needs costs one
// click and cannot rot the same way.
async function showTree(page: Page) {
  await page.getByTestId('sort-path').click();
  await expect(page.getByTestId('dir-entry').first()).toBeVisible();
}

async function showRecent(page: Page) {
  await page.getByTestId('sort-recent').click();
  await expect(page.getByTestId('chrono-item').first()).toBeVisible();
}

/** Switch to Recent and open its first row. */
async function openFirstFact(page: Page) {
  await showRecent(page);
  const row = page.getByTestId('chrono-item').first();
  await row.click();
  await expect(page.getByTestId('fact-body')).toBeVisible();
}

test.describe('/explore live KB browser', () => {
  test('renders the browser and its library', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByTestId('explore-browser')).toBeVisible();
    await expect(page.getByTestId('left-panel')).toBeVisible();
    // The default landing view: the ontology tree, not the chronological list.
    await expect(page.getByTestId('dir-entry').first()).toBeVisible();
    // Its companion, and the reason Path is a good landing view — the folder
    // overview carries the facets and the highlights, both new in v0.5.2.
    await expect(page.getByTestId('facet-panel')).toBeVisible();
    await expect(page.getByTestId('highlight-row').first()).toBeVisible();
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

  test('shows the connection counts only while a fact is open', async ({ page }) => {
    await page.goto('/explore');
    // Nothing is open on arrival (Path sort opens no fact), so the absent
    // case is reachable directly — assert it before opening anything.
    //
    // Visibility, never the count's VALUE: a cell renders for a fact with no
    // edges too (ConnectionsMenu returns an inert div rather than vanishing,
    // so the header doesn't reflow), and which fact lands first depends on
    // what the KB most recently committed. Asserting a number here would tie
    // the suite to KB contents.
    await expect(page.getByTestId('dir-entry').first()).toBeVisible();
    await expect(page.getByTestId('connections-out')).toHaveCount(0);

    await openFirstFact(page);
    await expect(page.getByTestId('connections-out')).toBeVisible();

    // ExploreBrowser's own Escape shortcut (`CLEAR_FILTERS`, which explicitly
    // nulls `factPath`) closes the fact; the cells go with it.
    await page.getByTestId('explore-browser').press('Escape');
    await expect(page.getByTestId('connections-out')).toHaveCount(0);
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
    // toHaveCount(1) FIRST. On its own, toBeHidden() is satisfied by an
    // element that does not exist — so when the vendored test id changes
    // under `npm run sync`, the CSS rule hiding it stops matching, a live
    // retract button appears on a public page, and this test stays green.
    // Reproduced: renaming retract-btn upstream produced a visible, clickable
    // control with its confirmation modal, with the suite passing.
    await expect(page.getByTestId('retract-btn')).toHaveCount(1);
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
    await showRecent(page);

    // A `path:` chip narrows `api.recent`'s path argument, and — unlike a
    // content chip — leaves librarySort alone, so the list keeps rendering as
    // `chrono-item` rows rather than switching shape underneath the assertion.
    await page.locator('#filter-input').fill('path:kb/gotchas');
    await page.locator('#filter-input').press('Enter');
    await expect(page.getByTestId('left-panel')).toHaveAttribute('data-sort', 'recent');

    // Assert the SCOPING, never a row count. This test used to compare counts
    // before and after, which silently stopped testing anything once the KB
    // grew: rows are capped at one 50-fact page, and `kb/gotchas` passed 50
    // facts, so both sides clamped to 50 and "fewer rows" became unprovable.
    // Every rendered row being under the chip's path is true at any KB size.
    await expect.poll(async () =>
      (await page.getByTestId('chrono-item').evaluateAll(
        els => els.map(e => e.getAttribute('data-path')))
      ).every(p => p?.startsWith('kb/gotchas/')),
    ).toBe(true);
    // …and that it actually matched something, so an empty list can't pass
    // the check above vacuously.
    await expect(page.getByTestId('chrono-item').first()).toBeVisible();
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

    // 3 — a real filter chip lands, and the reader's order SURVIVES it.
    // Not relevance: v0.5.2 made `searchActive` free-text-only, because
    // relevance needs something to rank against and a chip is not it
    // (Library.tsx). A chip now narrows the list in place.
    await next();
    await expect(page.getByTestId('left-panel')).toHaveAttribute('data-sort', 'recent');
    await expect(frame).toContainText('type:synthesis');

    // 4 — a fact is open. Remember which: step 7 has to come back to it.
    await next();
    await expect(page.getByTestId('fact-title')).toBeVisible();
    await expect(frame).toHaveAttribute('data-tour-highlight', 'fact');
    const synthesisTitle = (await page.getByTestId('fact-title').textContent())!.trim();

    // 5 — hopped down an edge; the connection cells are the highlight.
    await next();
    await expect(frame).toHaveAttribute('data-tour-highlight', 'edges');
    await expect(page.getByTestId('connections-out')).toBeVisible();

    // 6 — time-travel: the filter input is replaced by the trail breadcrumb,
    // which is how we know the anchor really left live.
    await next();
    await expect(bar).toContainText('6/8');
    await expect(page.locator('#filter-input')).toHaveCount(0);

    // 7 — back up the edge AND back to live. Both halves are asserted:
    // `#filter-input` proves the anchor returned to live, and the title
    // proves we hopped back to the SYNTHESIS rather than merely un-pinning
    // where we stood. Asserting only the first passed when step 6 was
    // reverted to `await tt.returnToNow()` — live, but on the wrong fact —
    // which is exactly the stale-ref regression this claims to guard.
    await next();
    await expect(page.locator('#filter-input')).toHaveCount(1);
    await expect(page.getByTestId('fact-title')).toHaveText(synthesisTitle);

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
    // Put the page in the state this test is about: Recent, with a fact open.
    // That is also what makes step 1's guard load-bearing — librarySort is
    // already 'recent', so the step's SET_LIBRARY_SORT must NOT fire.
    await openFirstFact(page);
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

  test('a click during the flight cannot double-run the step', async ({ page }) => {
    await page.goto('/explore');
    await page.getByTestId('tour-start').click();
    // Advance to step 2, so the NEXT transition runs step 3 — whose action is
    // ADD_FILTER. That matters: the reducer appends non-path chips without
    // deduping (state.ts:209, `[...s.filters, a.chip]`), so a step that runs
    // twice leaves two identical chips. Every other step's action is
    // idempotent, which is why the previous version of this test could not
    // observe the guard at all: with `if (busy)` replaced by `if (false)` it
    // still passed, because both clicks compute the same target index and the
    // duplicated work was invisible.
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-bar')).toContainText('2/8');

    await page.getByTestId('tour-next').click();
    // Mid-flight, after the guard is set but well before the ~1.2s advance.
    await page.waitForTimeout(300);
    await page.getByTestId('tour-next').dispatchEvent('click');

    await expect(page.getByTestId('tour-bar')).toContainText('3/8');
    // Exactly one chip. Two means the step ran twice.
    await expect(page.locator('.explore-frame').getByText('type:synthesis')).toHaveCount(1);
  });

  test('on a phone the narration stays on screen for every step', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/explore');
    await page.getByTestId('tour-start').click();

    const bar = page.getByTestId('tour-bar');
    for (let step = 2; step <= 8; step++) {
      await page.getByTestId('tour-next').click();
      await expect(bar).toContainText(`${step}/8`);
      // Two separate bugs sent the bar off screen here. scrollIntoView walks
      // every scrollable ancestor including the document, so both the tour's
      // own targeting and the mobile fact-auto-scroll effect scrolled the
      // page rather than the pane — leaving a pointer moving around with
      // nothing left to explain it.
      // The requirement is that the narration stays readable, which is what
      // toBeInViewport asserts. Not window.scrollY === 0: Playwright's own
      // click actionability scrolls the document to reach the button, so an
      // exact scroll assertion would be testing the harness, not the page.
      await expect(bar).toBeInViewport();
    }
  });

  test('skipping mid-flight does not resurrect the tour', async ({ page }) => {
    await page.goto('/explore');
    await page.getByTestId('tour-start').click();
    // Advance to step 5, so the pending flight is the one into step 6 —
    // whose action scrubs into time-travel. That was the worst case: stop()
    // nulled the open fact, then the orphaned timer fired anyway and pinned a
    // historical anchor, leaving someone who had just opted out looking at no
    // fact, in history, with no filter bar.
    for (let i = 0; i < 4; i++) {
      await page.getByTestId('tour-next').click();
      await expect(page.getByTestId('tour-bar')).toContainText(`${i + 2}/8`);
    }
    await page.getByTestId('tour-next').click();
    await page.waitForTimeout(250);          // mid-flight
    await page.getByTestId('tour-skip').click();

    await expect(page.getByTestId('tour-bar')).toHaveCount(0);
    await expect(page.getByTestId('tour-launcher')).toBeVisible();

    // Outlast both scheduled timers (900ms travel + 320ms click) with room to
    // spare. Nothing may come back.
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('tour-bar')).toHaveCount(0);
    await expect(page.getByTestId('tour-cursor')).toHaveCount(0);
    await expect(page.getByTestId('tour-launcher')).toBeVisible();
    // And the app is left usable: live anchor, no filters, library restored.
    await expect(page.locator('#filter-input')).toHaveCount(1);
    await expect(page.getByTestId('left-panel')).toHaveAttribute('data-sort', 'recent');
  });

  test('the launcher names the real repo and links to it', async ({ page }) => {
    await page.goto('/explore');
    await page.getByTestId('tour-dismiss').click();
    const launcher = page.getByTestId('tour-launcher');
    // Typographic apostrophes in the copy (&rsquo;), so match around them.
    await expect(launcher).toContainText(/browsing/);
    await expect(launcher).toContainText(/own web UI, served as a static snapshot/);
    // Shape, never values. `prebuild` re-clones KB_REF on every build and the
    // KB only grows — asserting 147/83 went red overnight at 169/92. What
    // matters is that real numbers are interpolated, not that they are any
    // particular numbers.
    await expect(launcher).toContainText(/\d+ facts, \d+ commits of history/);
    // Label and href both derive from bundle.repo, so this catches a
    // retargeted KB_REPO_SLUG leaving the link pointing at the old repo.
    const link = launcher.getByRole('link');
    await expect(link).toHaveText('agentic-engineering-kb');
    await expect(link).toHaveAttribute('href', 'https://github.com/knomit/agentic-engineering-kb');
  });
});
