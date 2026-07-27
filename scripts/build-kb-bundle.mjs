#!/usr/bin/env node
/**
 * Build-time snapshot of a public knomit KB repo into a single JSON bundle.
 *
 * The whole corpus INCLUDING full history is ~107 KB brotli for the reference
 * repo (68 commits, 123 facts, 161 distinct versions), so shipping everything
 * beats any runtime GitHub API scheme — no rate limit, no token, no proxy, and
 * time-travel becomes an in-memory lookup.
 *
 * Source resolution mirrors scripts/sync.mjs:
 *   1. KB_SRC   — a local clone (fastest; dev).
 *   2. git clone — public HTTPS, no token.
 *   3. Vendored — reuse the previously built bundle rather than failing.
 */
import { mkdir, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'kb');
const GEN_DIR = path.join(ROOT, 'src', 'generated');

const REPO = process.env.KB_REPO_SLUG || 'knomit/agentic-engineering-kb';
const REF = process.env.KB_REF || 'agent/mindev.local-8ef0cd32';
const SRC = process.env.KB_SRC || '';
const SCHEMA_VERSION = 1;

async function git(cwd, ...args) {
  const { stdout } = await exec('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

/**
 * Run `git cat-file --batch`, feeding it `shas` on stdin and collecting the
 * raw output. `execFile`'s `input` option only works on the *Sync* variants —
 * the async form silently ignores it, so a plain `exec(...)` call here hangs
 * waiting on stdin until it times out. Spawn + write stdin manually instead.
 */
function catFileBatch(cwd, shas) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['cat-file', '--batch'], { cwd });
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git cat-file --batch exited ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    child.stdin.end(shas.join('\n') + '\n');
  });
}

/** Split `---\nyaml\n---\nbody` into a BundleFact. Never throws. */
export function parseFact(raw) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) {
    return { title: '', body: raw, domain: [], entities: [], refs: [],
             confidence: 0, sources: 0, parse_error: 'missing frontmatter' };
  }
  let fm = {};
  let parse_error;
  try {
    fm = parseYaml(m[1]) || {};
  } catch (err) {
    parse_error = `frontmatter: ${err.message}`;
  }
  let body = m[2];
  let title = '';
  const h1 = /^#\s+(.+)$/m.exec(body);
  if (h1) {
    title = h1[1].trim();
    body = body.slice(0, h1.index) + body.slice(h1.index + h1[0].length);
  }
  const arr = (v) => (Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)]);
  return {
    title,
    body: body.trim(),
    type: fm.type ? String(fm.type) : undefined,
    kind: fm.kind ? String(fm.kind) : undefined,
    origin: fm.origin ? String(fm.origin) : undefined,
    domain: arr(fm.domain),
    entities: arr(fm.entities),
    refs: arr(fm.refs),
    confidence: Number(fm.confidence ?? 0),
    sources: Number(fm.sources ?? 0),
    ...(parse_error ? { parse_error } : {}),
  };
}

/**
 * Walk `ref`'s history in `repoDir` and assemble the bundle.
 * @param {string} repoDir
 * @param {string} ref
 * @returns {Promise<import('../src/lib/bundleTypes.ts').Bundle>}
 */
export async function buildBundle(repoDir, ref) {
  const SEP = '\x1f';
  const logOut = await git(repoDir, 'log', `--format=%H${SEP}%at${SEP}%an${SEP}%s`, ref);
  const commits = logOut.split('\n').filter(Boolean).map((line) => {
    const [sha, ts, author, ...rest] = line.split(SEP);
    return { sha, ts: Number(ts), author, subject: rest.join(SEP) };
  });

  const trees = {};
  const wanted = new Set();
  for (const c of commits) {
    const out = await git(repoDir, 'ls-tree', '-r', c.sha);
    const tree = {};
    for (const line of out.split('\n')) {
      if (!line) continue;
      const [meta, filePath] = line.split('\t');
      const [, type, sha] = meta.split(/\s+/);
      if (type !== 'blob') continue;
      if (!filePath.startsWith('kb/') || !filePath.endsWith('.md')) continue;
      tree[filePath] = sha;
      wanted.add(sha);
    }
    trees[c.sha] = tree;
  }

  // One batch call rather than N `cat-file -p` spawns.
  const blobs = {};
  const shas = [...wanted];
  const stdout = await catFileBatch(repoDir, shas);
  let off = 0;
  for (const sha of shas) {
    const nl = stdout.indexOf(0x0a, off);
    const header = stdout.subarray(off, nl).toString('utf8');   // "<sha> blob <size>"
    const size = Number(header.split(' ')[2]);
    const start = nl + 1;
    blobs[sha] = parseFact(stdout.subarray(start, start + size).toString('utf8'));
    off = start + size + 1;                                     // trailing newline
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    repo: REPO, ref,
    head: commits[0].sha,
    commits, trees, blobs,
  };
}

async function isDirectory(p) {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Resolve a checkout: `src`, else a shallow-free clone into a temp dir. */
async function resolveRepo(src) {
  if (src) {
    if (!(await isDirectory(src))) {
      // Without this check, a typo'd/missing KB_SRC reaches `git` and fails
      // with a misleading `spawn git ENOENT` — as if git itself were absent.
      throw new Error(`KB_SRC does not exist or is not a directory: ${src}`);
    }
    console.log(`  · using local KB checkout ${src}`);
    return { dir: src, cleanup: async () => {} };
  }
  const dir = path.join(tmpdir(), `kb-bundle-${process.pid}`);
  await rm(dir, { recursive: true, force: true });
  console.log(`  · cloning https://github.com/${REPO}`);
  await exec('git', ['clone', '--no-single-branch', '-q',
                     `https://github.com/${REPO}.git`, dir]);
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** Reuse a previously built bundle so a failure degrades, not fails outright. */
async function reuseVendored(outDir, genDir) {
  try {
    const existing = (await readdir(outDir)).filter(f => /^bundle-[0-9a-f]{8}\.json$/.test(f));
    if (!existing.length) return false;
    const name = existing[0];
    await writeFile(path.join(genDir, 'kb-bundle-url.ts'),
      `// GENERATED by scripts/build-kb-bundle.mjs — do not edit.\n` +
      `export const BUNDLE_URL = '/kb/${name}';\n`, 'utf8');
    console.warn(`  ~ using vendored ${name} (could not refresh from source)`);
    return true;
  } catch { return false; }
}

/**
 * Resolve, build, and write the bundle to `outDir`/`genDir`, falling back to
 * a vendored bundle if EITHER step fails — resolving the repo (bad KB_SRC,
 * network) or building it (a ref that no longer exists, the common case for
 * KB_REF, a per-machine agent branch that can be renamed or deleted). A
 * perfectly good bundle already on disk should never be thrown away because
 * the *next* one couldn't be produced.
 *
 * Exported (params default to the real paths/env) so tests can point outDir/
 * genDir at a temp directory instead of the real public/kb + src/generated.
 */
export async function buildAndWrite({ outDir = OUT_DIR, genDir = GEN_DIR, src = SRC, ref = REF } = {}) {
  console.log(`knomit KB bundle — repo=${REPO}, ref=${ref}`);
  await mkdir(outDir, { recursive: true });
  await mkdir(genDir, { recursive: true });

  let repo;
  try {
    repo = await resolveRepo(src);
  } catch (err) {
    console.warn(`  ! ${err.message}`);
    if (await reuseVendored(outDir, genDir)) return;
    throw new Error(`Could not obtain the KB repo. Set KB_SRC to a local clone, or check KB_REPO_SLUG/KB_REF.`);
  }

  try {
    const remoteRef = src ? ref : `origin/${ref}`;
    const bundle = await buildBundle(repo.dir, remoteRef);
    bundle.ref = ref;

    const json = JSON.stringify(bundle);
    const hash = createHash('sha256').update(json).digest('hex').slice(0, 8);
    const name = `bundle-${hash}.json`;

    // Content-addressed: a redeploy always produces a URL nobody has cached,
    // so a stale edge copy can never outlive a KB update.
    for (const stale of (await readdir(outDir)).filter(f => f.startsWith('bundle-'))) {
      if (stale !== name) await rm(path.join(outDir, stale), { force: true });
    }
    await writeFile(path.join(outDir, name), json, 'utf8');
    await writeFile(path.join(genDir, 'kb-bundle-url.ts'),
      `// GENERATED by scripts/build-kb-bundle.mjs — do not edit.\n` +
      `export const BUNDLE_URL = '/kb/${name}';\n`, 'utf8');

    console.log(`  ✓ ${name}  (${bundle.commits.length} commits, ` +
      `${Object.keys(bundle.trees[bundle.head]).length} facts, ` +
      `${Object.keys(bundle.blobs).length} versions, ${json.length} bytes raw)`);
  } catch (err) {
    console.warn(`  ! ${err.message}`);
    if (await reuseVendored(outDir, genDir)) return;
    throw new Error(`Could not build the KB bundle from ${src || REPO}@${ref}. Set KB_SRC to a local clone, or check KB_REPO_SLUG/KB_REF.`);
  } finally {
    await repo.cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildAndWrite().catch((err) => { console.error(`\nkb bundle failed: ${err.message}`); process.exit(1); });
}
