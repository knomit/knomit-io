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
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { accessSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

async function main() {
  console.log(`knomit sync — ref=${REF}${LOCAL ? `, local=${LOCAL}` : ''}`);
  await mkdir(OUT_DIR, { recursive: true });
  for (const artifact of ARTIFACTS) {
    await syncOne(artifact);
  }

  await syncUI();

  // Publish the spec under public/ so the REST API page (Scalar) can fetch it
  // at /openapi.yaml and offer it as a download.
  const specSrc = path.join(OUT_DIR, 'openapi.yaml');
  if (await exists(specSrc)) {
    const publicSpec = path.join(ROOT, 'public', 'openapi.yaml');
    await mkdir(path.dirname(publicSpec), { recursive: true });
    await writeFile(publicSpec, await readFile(specSrc, 'utf8'), 'utf8');
    console.log(`  ✓ public/openapi.yaml  (served at /openapi.yaml)`);
  }
}

main().catch((err) => {
  console.error(`\nsync failed: ${err.message}`);
  process.exit(1);
});
