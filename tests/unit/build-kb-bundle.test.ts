import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildBundle } from '../../scripts/build-kb-bundle.mjs';

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
      for (const p of Object.keys(tree)) expect(p.startsWith('kb/')).toBe(true);
    }
  });
});
