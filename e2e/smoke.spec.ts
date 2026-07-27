import { test, expect } from '@playwright/test';

test.describe('marketing site', () => {
  test('landing renders hero, CTAs, and chrome', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/knomit/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Learn it once/i
    );
    // Primary + secondary CTAs.
    await expect(page.getByRole('link', { name: /View on GitHub/i }).first()).toBeVisible();
    // Demo link is hidden until the hosted instance exists (DEMO_LIVE=false).
    await expect(page.getByRole('link', { name: /See it live/i })).toHaveCount(0);
    // Footer "Live demo" link must also be absent in production.
    await expect(page.getByRole('link', { name: /Live demo/i })).toHaveCount(0);
    // Footer present.
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });

  test('primary nav links resolve', async ({ page }) => {
    await page.goto('/');
    for (const [name, path] of [
      ['Concepts', '/concepts'],
      ['Use cases', '/use-cases'],
      ['Blog', '/blog'],
    ] as const) {
      const res = await page.request.get(path);
      expect(res.status(), `${name} -> ${path}`).toBe(200);
    }
  });
});

test.describe('blog', () => {
  test('index lists the seed post', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.getByRole('heading', { name: /Real-world use cases/i })).toBeVisible();
    const post = page.getByRole('link', { name: /how knomit holds its own shape/i });
    await expect(post.first()).toBeVisible();
  });

  test('a post renders with byline and navigates back', async ({ page }) => {
    await page.goto('/blog');
    await page.getByRole('link', { name: /how knomit holds its own shape/i }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Dogfooding/i);
    await page.getByRole('link', { name: '← Blog' }).click();
    await expect(page).toHaveURL(/\/blog\/?$/);
  });
});

test.describe('docs', () => {
  test('quick start renders and REST reference is generated', async ({ page }) => {
    await page.goto('/docs/quick-start');
    await expect(page.getByRole('heading', { name: 'Quick start' })).toBeVisible();
    // OpenAPI-generated REST reference exists.
    const api = await page.request.get('/docs/api/');
    expect(api.status()).toBe(200);
  });
});

test.describe('explore', () => {
  // /explore now mounts the real, live KB browser (an island, not an iframe);
  // the "Browse a living knowledge base" teaser this test used to assert is
  // the DEGRADED path — it only shows if the bundle fails to load, which
  // e2e/explore.spec.ts covers directly by simulating that failure. This
  // smoke test just needs to confirm the live page comes up.
  test('mounts the live browser, not an iframe embed', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.locator('iframe.explore-frame')).toHaveCount(0);
    await expect(page.getByTestId('explore-browser')).toBeVisible();
  });
});

test.describe('feeds & meta', () => {
  test('rss is well-formed and lists the post', async ({ page }) => {
    const res = await page.request.get('/rss.xml');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('xml');
    const body = await res.text();
    expect(body).toContain('<rss');
    expect(body).toContain('knomit blog');
    expect(body).toContain('Dogfooding');
  });

  test('sitemap and robots exist', async ({ page }) => {
    expect((await page.request.get('/sitemap-index.xml')).status()).toBe(200);
    const robots = await page.request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain('Sitemap:');
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    const res = await page.goto('/no-such-fact-xyz');
    expect(res?.status()).toBe(404);
    await expect(page.getByText(/No fact at this path/i)).toBeVisible();
  });
});
