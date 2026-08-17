import { test, expect } from '@playwright/test';
import { GA_MEASUREMENT_ID } from '../src/lib/site';

// Why this file exists: the deploy job ships the exact artifact CI tested
// (ci.yml — "no rebuild, no drift"), so `import.meta.env.PROD` is true for the
// build Playwright runs against. The gtag snippet therefore shipped into the
// test run and fired real hits at the live GA4 property from a GitHub runner:
// every test gets a fresh browser context, so each page load arrived with a new
// client_id and `_fv=1` and GA4 counted it as a brand-new user. Eight scheduled
// rebuilds a day plus every push and PR read as hundreds of visitors.
//
// The gate is therefore a RUNTIME check on the serving host, because that is
// the only thing that actually differs between the tested artifact and the
// deployed one. These two tests pin both halves of it.

const ANALYTICS_HOST = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/;

test('sends no analytics hits when served from a non-production host', async ({ page }) => {
  const hits: string[] = [];
  page.on('request', r => { if (ANALYTICS_HOST.test(r.url())) hits.push(r.url()); });

  // Both call sites: BaseHead for the marketing pages, the Starlight Head
  // override for /docs. A gate applied to only one of them still leaks.
  for (const path of ['/', '/docs/quick-start/']) {
    await page.goto(path);
    // Absence needs a window in which the hit could have appeared: the
    // injected tag requests gtag.js during parse and collects immediately
    // after, so anything that was going to fire has fired by network idle.
    await page.waitForLoadState('networkidle');
  }

  expect(hits, `analytics hits leaked from ${page.url()}`).toEqual([]);
});

test('still ships the tag, gated on the production host', async ({ page }) => {
  // The counterpart assertion. On its own the test above is satisfied by
  // deleting analytics entirely, which would be a silent, permanent outage of
  // the thing we are trying to keep clean.
  const html = await (await page.request.get('/')).text();
  expect(html).toContain(GA_MEASUREMENT_ID);
  expect(html, 'the tag must be gated on the serving host, not shipped bare')
    .toContain('location.hostname');
});
