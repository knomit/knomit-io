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
