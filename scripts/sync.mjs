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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src', 'generated');

// Pinned reference for reproducible builds. Bump deliberately when adopting a
// new knomit release. `main` is the fallback until the first public tag exists.
const REF = process.env.KNOMIT_REF || 'main';
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

async function main() {
  console.log(`knomit sync — ref=${REF}${LOCAL ? `, local=${LOCAL}` : ''}`);
  await mkdir(OUT_DIR, { recursive: true });
  for (const artifact of ARTIFACTS) {
    await syncOne(artifact);
  }
}

main().catch((err) => {
  console.error(`\nsync failed: ${err.message}`);
  process.exit(1);
});
