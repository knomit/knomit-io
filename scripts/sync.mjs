#!/usr/bin/env node
/**
 * Build-time sync of canonical artifacts from the knomit source repo.
 *
 * The REST API reference is GENERATED from knomit's own `openapi.yaml`, never
 * hand-copied — this keeps the docs from drifting. We also pull the README so
 * the Quick start can be checked against the source of truth.
 *
 * Source resolution, in order:
 *   1. KNOMIT_SRC  — path to a local knomit checkout (fastest; used in dev).
 *   2. GitHub raw  — the knomit repo (KNOMIT_REPO_SLUG) pinned to KNOMIT_REF
 *                    (a tag or SHA), with optional GITHUB_TOKEN for private access.
 *   3. Vendored    — if a previously-synced copy already exists, keep it and
 *                    warn rather than failing the build.
 *
 * Outputs land in src/generated/ (gitignored) and are consumed by the docs.
 */
import { mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { accessSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolveImportGraph, renderApiBarrel, writeVendorSwap, SEEDS } from './lib/vendor-ui.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src', 'generated');

// Pinned reference for reproducible builds. Bump deliberately when adopting a
// new knomit release. `master` (the repo's default branch) is the fallback
// until the first public tag exists.
const REF = process.env.KNOMIT_REF || 'master';
const REPO = process.env.KNOMIT_REPO_SLUG || 'knomit/knomit';
const TOKEN = process.env.GITHUB_TOKEN || process.env.KNOMIT_TOKEN || '';

// A file that only a real knomit checkout has — used to validate candidates.
const SENTINEL = 'internal/web/static/openapi.yaml';

/**
 * Resolve a local knomit checkout. Honors KNOMIT_SRC, otherwise probes the
 * common layouts (a sibling/nearby `knomit/` clone), so the typical
 * side-by-side checkout needs no configuration.
 */
function resolveLocal() {
  const candidates = [
    process.env.KNOMIT_SRC,
    path.join(ROOT, '..', 'knomit'),
    path.join(ROOT, '..', '..', 'knomit'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      accessSync(path.join(dir, SENTINEL), constants.F_OK);
      return path.resolve(dir);
    } catch {
      /* not a usable checkout — try next */
    }
  }
  return '';
}

const LOCAL = resolveLocal();

/** Files to pull: source path in the knomit repo -> output filename. */
const ARTIFACTS = [
  { src: SENTINEL, out: 'openapi.yaml', required: true },
  { src: 'README.md', out: 'knomit-readme.md', required: false },
];

const UI_SRC_DIR = 'web/src';
const UI_OUT_DIR = path.join(OUT_DIR, 'kb-ui');
// Local checkouts are usually AHEAD of the pinned ref (the knomit dev branch runs
// hundreds of commits past master). Vendoring from local by default would build a
// different site locally than in CI, so UI files take the pinned ref unless the
// developer opts in explicitly.
const UI_ALLOW_LOCAL = process.env.KNOMIT_UI_LOCAL === '1';

const exists = (p) =>
  access(p, constants.F_OK).then(() => true).catch(() => false);

async function fromLocal(srcPath) {
  if (!LOCAL) return null;
  const full = path.join(LOCAL, srcPath);
  if (!(await exists(full))) return null;
  return readFile(full, 'utf8');
}

async function fromGitHub(srcPath) {
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${srcPath}`;
  const headers = { 'User-Agent': 'knomit-site-sync' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub fetch ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * The latest STABLE release, written to src/generated/release.json for the
 * /download page.
 *
 * Fetched rather than hardcoded because GitHub's `releases/latest/download/`
 * shortcut cannot be used here: it resolves an asset by exact filename, and
 * knomit's asset names embed the version (Knomit-0.5.2-darwin-arm64.app.zip).
 * A static href would therefore pin one release forever and rot silently at
 * the next one. This site already rebuilds on a 3-hourly schedule, so reading
 * the release at build time keeps /download correct within hours of a tag with
 * no manual bump.
 *
 * `/releases/latest` is the right endpoint precisely because it EXCLUDES
 * prereleases and drafts — the rolling `dev-latest` pre-release must never
 * become the thing the front page offers.
 *
 * Failure is never fatal, matching every other artifact here: an unreachable
 * or rate-limited API keeps the previously vendored release.json and warns. A
 * build with no vendored copy at all still succeeds — the page renders its
 * "releases on GitHub" fallback instead of a version it cannot name. That
 * matters because this is the one artifact with no local-checkout path: a
 * working tree has tags, but it does not have the built, signed assets.
 */
async function syncRelease() {
  const dest = path.join(OUT_DIR, 'release.json');
  const url = `https://api.github.com/repos/${REPO}/releases/latest`;
  const headers = {
    'User-Agent': 'knomit-site-sync',
    Accept: 'application/vnd.github+json',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`GitHub releases ${url} -> ${res.status} ${res.statusText}`);
    const r = await res.json();
    // Store only what the page renders. The full payload is ~40KB of API
    // metadata, and pinning the shape here means an upstream field rename
    // shows up as a missing key in one place rather than across the template.
    const release = {
      tag: r.tag_name,
      // Assets are named with a bare version, no leading "v".
      version: String(r.tag_name ?? '').replace(/^v/, ''),
      url: r.html_url,
      published: r.published_at,
      assets: (r.assets ?? [])
        // The .ed25519 sidecars are listed on the page as a verification
        // detail, not as downloads in their own right.
        .filter(a => !a.name.endsWith('.ed25519'))
        .map(a => ({ name: a.name, url: a.browser_download_url, size: a.size })),
    };
    if (!release.tag || !release.assets.length) {
      throw new Error('release payload had no tag or no downloadable assets');
    }
    await writeFile(dest, `${JSON.stringify(release, null, 2)}\n`, 'utf8');
    console.log(`  ✓ release.json  (${release.tag}, ${release.assets.length} assets)`);
  } catch (err) {
    console.warn(`  ! ${err.message}`);
    if (await exists(dest)) {
      console.warn('  ~ using vendored release.json (could not refresh from GitHub)');
      return;
    }
    console.warn('  ! no release metadata: /download will link to the releases page');
  }
}

async function syncOne({ src, out, required }) {
  const dest = path.join(OUT_DIR, out);
  let content = null;
  let origin = '';

  try {
    content = await fromLocal(src);
    if (content) origin = `local:${LOCAL}`;
  } catch (err) {
    console.warn(`  ! local read failed for ${src}: ${err.message}`);
  }

  if (!content) {
    try {
      content = await fromGitHub(src);
      origin = `github:${REPO}@${REF}`;
    } catch (err) {
      console.warn(`  ! ${err.message}`);
    }
  }

  if (!content) {
    if (await exists(dest)) {
      console.warn(`  ~ using vendored ${out} (could not refresh from source)`);
      return;
    }
    const msg = `Could not sync required artifact "${src}". Set KNOMIT_SRC to a local knomit checkout, or KNOMIT_REF + GITHUB_TOKEN.`;
    if (required) throw new Error(msg);
    console.warn(`  ! skipped optional ${out}: no source available`);
    return;
  }

  await writeFile(dest, content, 'utf8');
  console.log(`  ✓ ${out}  (${origin}, ${content.length} bytes)`);
}

async function syncUI() {
  const useLocal = UI_ALLOW_LOCAL && LOCAL;
  const read = async (rel) => {
    const srcPath = `${UI_SRC_DIR}/${rel}`;
    if (useLocal) {
      const full = path.join(LOCAL, srcPath);
      return (await exists(full)) ? readFile(full, 'utf8') : null;
    }
    const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${srcPath}`;
    const headers = { 'User-Agent': 'knomit-site-sync' };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub fetch ${url} -> ${res.status} ${res.statusText}`);
    return res.text();
  };

  const origin = useLocal ? `local:${LOCAL}` : `github:${REPO}@${REF}`;
  const { files, bareDeps, sources } = await resolveImportGraph(read, SEEDS);

  // Build the destination -> content map entirely from what resolveImportGraph
  // already read (no second read — sources.get never touches the network or
  // disk again), then hand it to writeVendorSwap, which only replaces
  // UI_OUT_DIR once every entry including the barrel is written. That keeps a
  // write-phase failure (disk full, permissions, ...) from ever leaving the
  // previous good vendor half-overwritten — matching the "keep the old copy,
  // warn, don't break the build" philosophy the other artifacts in this file
  // already follow (see the module docstring above).
  const entries = new Map();
  for (const rel of files) {
    // api.ts is vendored under a different name; the barrel below takes its slot.
    const out = rel === 'api.ts' ? 'upstreamApi.ts' : rel;
    entries.set(out, sources.get(rel));
  }
  entries.set('api.ts', renderApiBarrel());
  await writeVendorSwap(UI_OUT_DIR, entries);

  console.log(`  ✓ kb-ui/  (${origin}, ${files.length} files)`);

  // Fail loudly rather than at runtime if upstream grew a dependency we do not have.
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const have = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  const missing = bareDeps.filter(d => !have.has(d));
  if (missing.length) {
    throw new Error(
      `Vendored UI needs npm packages this site does not have: ${missing.join(', ')}.\n` +
      `Run: npm install --save ${missing.join(' ')}`);
  }
}

/**
 * Publish Scalar's standalone browser bundle under public/ so the REST API page
 * loads it same-origin.
 *
 * @scalar/astro otherwise points the reference at
 * `https://cdn.jsdelivr.net/npm/@scalar/api-reference` with NO version in the
 * URL, which meant /docs/api silently tracked Scalar's latest release and spent
 * a cross-origin round trip on ~1 MB we could set no cache headers for. Serving
 * it ourselves pins it to package.json and makes it immutably cacheable.
 *
 * It must be the `browser` (IIFE) build: @scalar/astro appends a classic
 * <script> and waits for `window.Scalar`, which the ESM build never sets. The
 * file is version-stamped so a dependency bump can never be served from cache
 * under the old name.
 */
async function syncScalar() {
  // package.json is not in the package's `exports` map, so resolve the entry
  // point and walk up to the package root rather than requiring it directly.
  const require = createRequire(path.join(ROOT, 'noop.js'));
  const entry = require.resolve('@scalar/api-reference');
  // lastIndexOf, not indexOf: the absolute path may itself contain a "dist"
  // segment (a checkout under ~/dist/…), and taking the first match would
  // resolve pkgRoot to that ancestor and read a completely unrelated
  // package.json.
  const cut = entry.lastIndexOf(`${path.sep}dist${path.sep}`);
  if (cut === -1) {
    // Guard rather than let slice(0, -1) silently lop one character off the
    // path and surface as ENOENT on ".../dist/index.j/package.json".
    throw new Error(`cannot locate @scalar/api-reference package root from ${entry}`);
  }
  const pkgRoot = entry.slice(0, cut);
  const { version } = JSON.parse(await readFile(path.join(pkgRoot, 'package.json'), 'utf8'));

  const src = path.join(pkgRoot, 'dist', 'browser', 'standalone.js');
  const name = `standalone-${version}.js`;
  const outDir = path.join(ROOT, 'public', 'vendor', 'scalar');

  // Read BEFORE destroying anything. The wipe exists because the filename is
  // version-stamped, so without it a bumped dependency leaves every previously
  // synced 3.7 MB bundle behind and Astro copies all of public/ into dist/.
  // But wiping first means a failed read (a bump that renames the browser
  // entry, a half-finished npm ci) leaves no bundle on disk while
  // src/generated/scalar.json still names the OLD one — and `npm start` is
  // `astro dev` with no sync, so the next run serves /docs/api with a script
  // tag that 404s and a silently blank reference. Same build-then-swap posture
  // as writeVendorSwap in scripts/lib/vendor-ui.mjs, for the same reason.
  const bundle = await readFile(src, 'utf8');
  await rm(outDir, { recursive: true, force: true });
  const dest = path.join(outDir, name);
  await mkdir(outDir, { recursive: true });
  await writeFile(dest, bundle, 'utf8');

  const url = `/vendor/scalar/${name}`;
  await writeFile(
    path.join(OUT_DIR, 'scalar.json'),
    `${JSON.stringify({ version, url }, null, 2)}\n`,
    'utf8'
  );
  console.log(`  ✓ public${url}  (Scalar ${version}, self-hosted)`);
}

async function main() {
  console.log(`knomit sync — ref=${REF}${LOCAL ? `, local=${LOCAL}` : ''}`);
  await mkdir(OUT_DIR, { recursive: true });
  for (const artifact of ARTIFACTS) {
    await syncOne(artifact);
  }

  await syncUI();
  await syncRelease();

  // Publish the spec under public/ so the REST API page (Scalar) can fetch it
  // at /openapi.yaml and offer it as a download.
  const specSrc = path.join(OUT_DIR, 'openapi.yaml');
  if (await exists(specSrc)) {
    const publicSpec = path.join(ROOT, 'public', 'openapi.yaml');
    await mkdir(path.dirname(publicSpec), { recursive: true });
    await writeFile(publicSpec, await readFile(specSrc, 'utf8'), 'utf8');
    console.log(`  ✓ public/openapi.yaml  (served at /openapi.yaml)`);
  }

  // Last, and deliberately so. This is the only fatal step in main(): every
  // other one either warns and keeps its vendored copy or fails before
  // anything downstream needs it. Running it here keeps a Scalar failure from
  // also blocking the openapi.yaml refresh above.
  await syncScalar();
}

main().catch((err) => {
  console.error(`\nsync failed: ${err.message}`);
  process.exit(1);
});
