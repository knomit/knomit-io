import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guard for the site's canonical URL shape: every internal link ends in `/`.
 *
 * astro.config.mjs sets `trailingSlash: 'always'`, but that only governs how the
 * dev/preview server matches routes — it does not rewrite the `href` we author.
 * A link written as `/docs/quick-start` still ships as-is and costs a 308 hop on
 * Cloudflare Pages, so the only enforcement possible is on the built output.
 *
 * This runs against `dist/`, which CI produces before `npm run test:unit` (see
 * .github/workflows/ci.yml — the build step is ordered first for exactly this
 * class of check). It fails rather than skips when `dist/` is missing: a guard
 * that quietly passes when it can't see the artifact is not a guard.
 */

const distDir = fileURLToPath(new URL('../../dist', import.meta.url));

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** `/foo/bar.svg` -> true. Extension-bearing paths are files, not routes. */
const hasFileExtension = (path: string) => /\.[a-zA-Z0-9]+$/.test(path.split('/').pop() ?? '');

describe('built HTML uses trailing-slash URLs', () => {
  it('has a dist/ to inspect', () => {
    expect(
      statSync(distDir, { throwIfNoEntry: false })?.isDirectory(),
      'dist/ not found — run `npm run build` before `npm run test:unit`',
    ).toBe(true);
  });

  it('emits no site-relative href without a trailing slash', () => {
    const offenders: string[] = [];

    for (const file of htmlFiles(distDir)) {
      const html = readFileSync(file, 'utf8');
      // Site-relative only: `//host/...` is protocol-relative and external.
      for (const [, href] of html.matchAll(/href="(\/[^/"][^"]*|\/)"/g)) {
        // Fragments and query strings hang off the path; judge the path alone.
        const path = href.split(/[?#]/)[0]!;
        if (path === '' || path.endsWith('/') || hasFileExtension(path)) continue;
        offenders.push(`${relative(distDir, file)}: ${href}`);
      }
    }

    expect(
      [...new Set(offenders)].sort(),
      'internal links must end in "/" (or be a file with an extension)',
    ).toEqual([]);
  });
});
