import { test, expect, type Page } from '@playwright/test';

async function jsonLdBlocks(page: Page) {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.map((t: string) => JSON.parse(t));
}

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

test.describe('structured data', () => {
  test('docs page emits BreadcrumbList and Organization', async ({ page }) => {
    await page.goto('/docs/quick-start');
    const blocks = await jsonLdBlocks(page);
    const types = blocks.map((b: any) => b['@type']);
    expect(types).toContain('Organization');
    expect(types).toContain('BreadcrumbList');
    const crumbs = blocks.find((b: any) => b['@type'] === 'BreadcrumbList');
    expect(crumbs.itemListElement.length).toBeGreaterThanOrEqual(2);
  });

  test('homepage emits Organization and WebSite', async ({ page }) => {
    await page.goto('/');
    const blocks = await jsonLdBlocks(page);
    const types = blocks.map((b: any) => b['@type']);
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
    const org = blocks.find((b: any) => b['@type'] === 'Organization');
    expect(org.name).toBe('knomit');
    expect(org.url).toMatch(/knomit\.io/);
  });

  test('blog post emits BlogPosting with dates', async ({ page }) => {
    await page.goto('/blog');
    await page.getByRole('link', { name: /how knomit holds its own shape/i }).first().click();
    const blocks = await jsonLdBlocks(page);
    const post = blocks.find((b: any) => b['@type'] === 'BlogPosting');
    expect(post, 'no BlogPosting block').toBeTruthy();
    expect(post.headline).toMatch(/Dogfooding/i);
    expect(post.datePublished).toBeTruthy();
    expect(post.author?.name).toBeTruthy();
  });
});

test('robots.txt welcomes AI crawlers and points to llms.txt', async ({ page }) => {
  const res = await page.request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const body = await res.text();
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
    expect(body, `missing ${bot}`).toContain(bot);
  }
  expect(body).toMatch(/llms\.txt/i);
});

test.describe('llms.txt', () => {
  test('llms.txt exists, is plain text, and links docs + blog', async ({ page }) => {
    const res = await page.request.get('/llms.txt');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/text\/plain/);
    const body = await res.text();
    expect(body).toMatch(/^# knomit/m);
    expect(body).toMatch(/\/docs\/quick-start/);
    expect(body).toMatch(/## (Docs|Blog)/);
  });

  test('llms-full.txt exists and embeds real content', async ({ page }) => {
    const res = await page.request.get('/llms-full.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(2000);
    expect(body).toMatch(/knomit/);
  });
});

test.describe('faq', () => {
  test('/faq renders questions and emits FAQPage schema', async ({ page }) => {
    const res = await page.request.get('/faq');
    expect(res.status()).toBe(200);
    await page.goto('/faq');
    await expect(page.getByRole('heading', { name: /what is knomit/i })).toBeVisible();
    const blocks = await jsonLdBlocks(page);
    const faq = blocks.find((b: any) => b['@type'] === 'FAQPage');
    expect(faq, 'no FAQPage block').toBeTruthy();
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(8);
    expect(faq.mainEntity[0].acceptedAnswer.text.length).toBeGreaterThan(20);
  });
});

test('homepage has an extractable one-sentence definition of knomit', async ({ page }) => {
  await page.goto('/');
  // A self-contained "knomit is ..." sentence is high-value for AI extraction.
  await expect(page.getByText(/knomit is .*knowledge/i).first()).toBeVisible();
});

test('homepage links to the FAQ', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^FAQ$/i }).first()).toBeVisible();
});

test.describe('compare', () => {
  test('/compare renders the operational-profile clusters with the key dimensions', async ({ page }) => {
    const res = await page.request.get('/compare');
    expect(res.status()).toBe(200);
    await page.goto('/compare');
    // /compare was rewritten from a table into operational-profile clusters that
    // name capabilities, not products — assert the cluster layout plus the
    // comparison dimensions the page actually contrasts. (Some dimension words
    // also appear in the decorative aria-hidden positioning map, so assert on
    // rendered body text rather than a possibly-decorative first match.)
    await expect(page.getByText(/operational profile/i).first()).toBeVisible();
    expect(await page.locator('.cmp-card').count()).toBeGreaterThanOrEqual(4);
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const term of ['provenance', 'synthesis', 'confidence', 'time-travel']) {
      expect(body, `/compare should mention ${term}`).toContain(term);
    }
  });
});

test('/security renders and covers signing, encryption, and local-first', async ({ page }) => {
  const res = await page.request.get('/security');
  expect(res.status()).toBe(200);
  await page.goto('/security');
  for (const term of [/Ed25519/i, /encrypt/i, /local/i, /open source/i]) {
    await expect(page.getByText(term).first()).toBeVisible();
  }
});

test.describe('sitemap', () => {
  test('sitemap includes new pages and excludes /explore', async ({ page }) => {
    const idx = await page.request.get('/sitemap-index.xml');
    expect(idx.status()).toBe(200);
    // Resolve the child sitemap from the index.
    const idxBody = await idx.text();
    const child = idxBody.match(/<loc>([^<]+sitemap[^<]*\.xml)<\/loc>/)?.[1];
    expect(child, 'no child sitemap in index').toBeTruthy();
    const childPath = new URL(child!).pathname;
    const body = await (await page.request.get(childPath)).text();
    for (const p of ['/faq', '/compare', '/security']) {
      expect(body, `sitemap missing ${p}`).toContain(p);
    }
    expect(body, 'sitemap should exclude /explore').not.toContain('/explore');
  });
});
