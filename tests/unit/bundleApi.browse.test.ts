import { describe, it, expect, beforeEach } from 'vitest';
import { setBundle, api } from '../../src/lib/bundleApi';
import { buildIndex } from '../../src/lib/kbIndex';
import { FIXTURE } from './fixtures/bundle';

const R = 'fixture', B = 'main';

beforeEach(() => setBundle(FIXTURE));

describe('buildIndex', () => {
  it('inverts refs into backlinks, ignoring external URLs', () => {
    const ix = buildIndex(FIXTURE);
    expect(ix.backlinks.get('kb/architecture/core/a1.md')).toEqual(['kb/gotchas/g1.md']);
    expect(ix.backlinks.has('https://example.com/paper')).toBe(false);
  });

  it('lists only HEAD paths', () => {
    expect(buildIndex(FIXTURE).headPaths.sort())
      .toEqual(['kb/architecture/adr.md', 'kb/architecture/core/a1.md', 'kb/gotchas/g1.md']);
  });
});

describe('api.browse', () => {
  it('returns immediate children of the root, directories first', async () => {
    const r = await api.browse(R, B, 'kb', 'kb');
    expect(r.children.map(c => c.name)).toEqual(['architecture', 'gotchas']);
    expect(r.children.every(c => c.is_dir)).toBe(true);
  });

  it('returns fact leaves with title, type and fullPath', async () => {
    const r = await api.browse(R, B, 'kb/gotchas', 'kb');
    expect(r.children).toHaveLength(1);
    expect(r.children[0]).toMatchObject({
      name: 'g1.md', is_dir: false, title: 'Gamma', type: 'gotcha',
      fullPath: 'kb/gotchas/g1.md',
    });
  });

  it('mixes directories and leaves at a level that has both, directories first', async () => {
    // kb/architecture has both the `core/` directory and the `adr.md` leaf.
    // "adr.md" < "core" alphabetically, so this only passes with dir-first
    // ordering, not a plain alphabetical sort.
    const r = await api.browse(R, B, 'kb/architecture', 'kb');
    expect(r.children.map(c => c.name)).toEqual(['core', 'adr.md']);
    expect(r.children.map(c => c.is_dir)).toEqual([true, false]);
    expect(r.children[1]).toMatchObject({
      name: 'adr.md', is_dir: false, title: 'Adr', type: 'decision',
      fullPath: 'kb/architecture/adr.md',
    });
  });
});

describe('api.fact', () => {
  it('reads the HEAD version when no commit is given', async () => {
    const fact = await api.fact(R, B, 'kb/architecture/core/a1.md');
    expect(fact.title).toBe('Alpha revised');
    expect(fact.confidence).toBe(0.9);
    expect(fact.entities).toEqual(['Widget']);
    expect(fact.commit_hash).toBe('c3');
  });

  it('reads an older version when a commit is given', async () => {
    const fact = await api.fact(R, B, 'kb/architecture/core/a1.md', 'c1');
    expect(fact.title).toBe('Alpha');
    expect(fact.commit_hash).toBe('c1');
  });

  it('rejects for a path absent from the requested tree', async () => {
    await expect(api.fact(R, B, 'kb/gotchas/g1.md', 'c1')).rejects.toThrow(/not found/i);
  });

  it('throws before a bundle is installed', async () => {
    setBundle(null as never);
    await expect(api.fact(R, B, 'kb/gotchas/g1.md')).rejects.toThrow(/bundle not loaded/);
  });
});
