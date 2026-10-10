import { describe, it, expect, beforeAll } from 'vitest';
import { api, setBundle } from '../../src/lib/bundleApi';
import { clusterKeyOf, stem } from '../../src/lib/bundleMotifs';
import { parseFact } from '../../scripts/build-kb-bundle.mjs';
import type { Bundle, BundleFact } from '../../src/lib/bundleTypes';

const f = (title: string, motifs?: string[], over: Partial<BundleFact> = {}): BundleFact => ({
  title, body: '', domain: [], entities: [], refs: [], confidence: 0.5, sources: 1,
  ...(motifs ? { motifs } : {}), ...over,
});

const BUNDLE: Bundle = {
  schemaVersion: 1, repo: 'x/y', ref: 'main', head: 'c1',
  commits: [{ sha: 'c1', ts: 1000, author: 'A', subject: 's' }],
  trees: { c1: {
    'kb/a/x/1.md': 'b1', 'kb/a/x/2.md': 'b2', 'kb/b/y/3.md': 'b3', 'kb/b/y/4.md': 'b4',
  } },
  blobs: {
    b1: f('One', ['silent-fallback', 'drift-config'], { kind: 'epistemic' }),
    b2: f('Two', ['fallback-silent'], { kind: 'epistemic' }),
    b3: f('Three', ['silent-fallbacks']),
    b4: f('Four'),
  },
};

beforeAll(() => setBundle(BUNDLE));

describe('motif vocabulary from frontmatter', () => {
  it('keys spellings by sorted stemmed tokens', () => {
    expect(stem('fallbacks')).toBe('fallback');
    expect(stem('policies')).toBe('policy');
    expect(stem('status')).toBe('status');
    expect(clusterKeyOf('silent-fallbacks')).toBe(clusterKeyOf('fallback-silent'));
  });

  it('clusters word order and plurals, elects the highest-df spelling', async () => {
    const page = await api.motifs('r', 'b');
    expect(page.count).toBe(2);
    const top = page.motifs[0];
    expect(top.df).toBe(3);
    expect(top.members.sort()).toEqual(['fallback-silent', 'silent-fallback', 'silent-fallbacks']);
    expect(top.canonical).toBe('fallback-silent');   // all df 1: lexicographic
    expect(top.definition_state).toBe('missing');
    expect(page.health.authored_recurring).toBe(1);
  });

  it('scopes df by path but keeps df_total branch-wide', async () => {
    const page = await api.motifs('r', 'b', { path: 'kb/a' });
    const c = page.motifs.find(m => m.members.includes('silent-fallback'))!;
    expect([c.df, c.df_total]).toEqual([2, 3]);
    expect(page.motifs.some(m => m.canonical === 'drift-config')).toBe(true);
  });

  it('resolves a cluster by key or by any spelling, 404 otherwise', async () => {
    const a = await api.motifCluster('r', 'b', 'silent-fallbacks');
    expect(a.carrier_count).toBe(3);
    expect(a.carriers.map(c => c.path).sort()).toEqual(['kb/a/x/1.md', 'kb/a/x/2.md', 'kb/b/y/3.md']);
    const b = await api.motifCluster('r', 'b', a.cluster_key);
    expect(b.cluster_key).toBe(a.cluster_key);
    await expect(api.motifCluster('r', 'b', 'nope-nothing')).rejects.toMatchObject({ status: 404 });
  });

  it('filters search and recent by motif, and returns motifs on the fact', async () => {
    const r = await api.recent('r', 'b', 'kb', '', 50, 0, { motifs: ['silent-fallback'] });
    expect(r.total).toBe(3);
    const s = await api.search('r', 'b', '', 'kb', 0, { motifs: ['drift-config'] });
    expect(s.results.map(x => x.path)).toEqual(['kb/a/x/1.md']);
    expect((await api.fact('r', 'b', 'kb/a/x/1.md')).motifs).toEqual(['silent-fallback', 'drift-config']);
    expect((await api.fact('r', 'b', 'kb/b/y/4.md')).motifs).toBeUndefined();
  });

  it('build script keeps the frontmatter motifs', () => {
    const raw = '---\ntype: pattern\nmotifs: [a-b, c-d]\n---\n# T\nbody';
    expect((parseFact(raw) as BundleFact).motifs).toEqual(['a-b', 'c-d']);
    expect('motifs' in parseFact('---\ntype: pattern\n---\n# T\nbody')).toBe(false);
  });
});
