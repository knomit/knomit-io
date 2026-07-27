import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildBundle, buildAndWrite } from '../../scripts/build-kb-bundle.mjs';

let repoDir: string;

function git(...args: string[]) {
  execFileSync('git', args, {
    cwd: repoDir,
    env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@e',
           GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@e' },
  });
}

async function fact(rel: string, body: string, refs: string[] = []) {
  const full = path.join(repoDir, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full,
    `---\ntype: pattern\ndomain: [alpha]\nconfidence: 0.8\nsources: 1\n` +
    `entities: [Widget]\nrefs: ${JSON.stringify(refs)}\n---\n# ${body}\n\nProse for ${body}.\n`);
}

beforeAll(async () => {
  repoDir = await mkdtemp(path.join(tmpdir(), 'kbfix-'));
  git('init', '-q', '-b', 'main');
  await fact('kb/architecture/a1.md', 'First fact');
  git('add', '-A'); git('commit', '-qm', 'add first');
  await fact('kb/architecture/a1.md', 'First fact revised');
  await fact('kb/gotchas/g1.md', 'Second fact', ['kb/architecture/a1.md']);
  // Two malformed facts, so the parse_error path is covered by the shared
  // fixture rather than by a test that mutates the repo mid-suite.
  await writeFile(path.join(repoDir, 'kb/broken.md'),
    `---\ntype: "unclosed\ndomain: [x\n---\n# Broken\n\nbody\n`);
  await writeFile(path.join(repoDir, 'kb/nofm.md'), `# No frontmatter\n\njust prose\n`);
  // Non-kb paths, mirroring the real corpus (a top-level README and a
  // domains/ directory), so "excludes non-kb paths" has something to exclude
  // — without these the assertion held vacuously against a kb/-only fixture.
  await writeFile(path.join(repoDir, 'README.md'), `# kbfix\n\nNot a fact.\n`);
  await mkdir(path.join(repoDir, 'domains'), { recursive: true });
  await writeFile(path.join(repoDir, 'domains/ontology.yaml'), `alpha: {}\n`);
  git('add', '-A'); git('commit', '-qm', 'revise and add');
});

afterAll(async () => { await rm(repoDir, { recursive: true, force: true }); });

describe('buildBundle', () => {
  it('emits a schema-versioned bundle with newest-first commits', async () => {
    const b = await buildBundle(repoDir, 'main');
    expect(b.schemaVersion).toBe(1);
    expect(b.commits).toHaveLength(2);
    expect(b.commits[0].subject).toBe('revise and add');
    expect(b.head).toBe(b.commits[0].sha);
  });

  it('yields two distinct blobs for a fact edited twice', async () => {
    const b = await buildBundle(repoDir, 'main');
    const p = 'kb/architecture/a1.md';
    const shas = b.commits.map(c => b.trees[c.sha][p]);
    expect(new Set(shas).size).toBe(2);
  });

  it('parses frontmatter into structured facts', async () => {
    const b = await buildBundle(repoDir, 'main');
    const sha = b.trees[b.head]['kb/gotchas/g1.md'];
    const f = b.blobs[sha];
    expect(f.title).toBe('Second fact');
    expect(f.type).toBe('pattern');
    expect(f.domain).toEqual(['alpha']);
    expect(f.entities).toEqual(['Widget']);
    expect(f.refs).toEqual(['kb/architecture/a1.md']);
    expect(f.confidence).toBe(0.8);
    expect(f.body).toContain('Prose for Second fact.');
    expect(f.body).not.toContain('# Second fact');
  });

  it('records a parse_error instead of throwing on malformed frontmatter', async () => {
    const b = await buildBundle(repoDir, 'main');
    const head = b.trees[b.head];

    // Unclosed quote — delimiters present, YAML invalid.
    const broken = b.blobs[head['kb/broken.md']];
    expect(broken.parse_error).toMatch(/frontmatter/);
    expect(broken.title).toBe('Broken');          // title still recovered

    // No delimiters at all.
    const nofm = b.blobs[head['kb/nofm.md']];
    expect(nofm.parse_error).toBe('missing frontmatter');
    expect(nofm.body).toContain('just prose');
  });

  it('excludes non-kb paths from trees', async () => {
    const b = await buildBundle(repoDir, 'main');
    for (const tree of Object.values(b.trees)) {
      const paths = Object.keys(tree);
      for (const p of paths) expect(p.startsWith('kb/')).toBe(true);
      // Explicit negatives: the fixture repo actually contains these paths,
      // so — unlike the startsWith check above — this fails if the kb/
      // filter in buildBundle is ever removed or narrowed.
      expect(paths).not.toContain('README.md');
      expect(paths).not.toContain('domains/ontology.yaml');
    }
  });
});

describe('buildAndWrite fallback', () => {
  let outDir: string;
  let genDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(path.join(tmpdir(), 'kb-out-'));
    genDir = await mkdtemp(path.join(tmpdir(), 'kb-gen-'));
    // Seed a previously-built bundle, as if an earlier successful run had
    // produced one.
    await writeFile(path.join(outDir, 'bundle-deadbeef.json'), '{"schemaVersion":1}');
  });

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
    await rm(genDir, { recursive: true, force: true });
  });

  it('reuses the vendored bundle and warns, rather than throwing, when the ref cannot be resolved', async () => {
    // repoDir resolves fine (it's a real local checkout via KB_SRC-equivalent
    // `src`), but the ref does not exist in it — this is the shape of the
    // real failure mode: KB_REF is a per-machine agent branch that can move
    // or disappear between the plan being written and the build running.
    await expect(
      buildAndWrite({ outDir, genDir, src: repoDir, ref: 'this-ref-does-not-exist' })
    ).resolves.toBeUndefined();

    const url = await readFile(path.join(genDir, 'kb-bundle-url.ts'), 'utf8');
    expect(url).toContain(`'/kb/bundle-deadbeef.json'`);

    // The seeded bundle must still be the only one present — a failed build
    // must not have deleted it as "stale".
    expect(await readdir(outDir)).toEqual(['bundle-deadbeef.json']);
  });

  it('throws when the ref cannot be resolved and no vendored bundle exists', async () => {
    const emptyOutDir = await mkdtemp(path.join(tmpdir(), 'kb-empty-'));
    try {
      await expect(
        buildAndWrite({ outDir: emptyOutDir, genDir, src: repoDir, ref: 'this-ref-does-not-exist' })
      ).rejects.toThrow(/Could not build the KB bundle/);
    } finally {
      await rm(emptyOutDir, { recursive: true, force: true });
    }
  });
});
