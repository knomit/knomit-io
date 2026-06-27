import { test, expect } from '@playwright/test';

async function jsonLdBlocks(page) {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.map((t) => JSON.parse(t));
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
    const types = blocks.map((b) => b['@type']);
    expect(types).toContain('Organization');
    expect(types).toContain('BreadcrumbList');
    const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');
    expect(crumbs.itemListElement.length).toBeGreaterThanOrEqual(2);
  });

  test('homepage emits Organization and WebSite', async ({ page }) => {
    await page.goto('/');
    const blocks = await jsonLdBlocks(page);
    const types = blocks.map((b) => b['@type']);
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
    const org = blocks.find((b) => b['@type'] === 'Organization');
    expect(org.name).toBe('knomit');
    expect(org.url).toMatch(/knomit\.io/);
  });

  test('blog post emits BlogPosting with dates', async ({ page }) => {
    await page.goto('/blog');
    await page.getByRole('link', { name: /Dogfooding/i }).first().click();
    const blocks = await jsonLdBlocks(page);
    const post = blocks.find((b) => b['@type'] === 'BlogPosting');
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
