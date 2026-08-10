import { describe, it, expect, beforeEach } from 'vitest';
import { setBundle, api } from '../../src/lib/bundleApi';
import type { Bundle, BundleFact } from '../../src/lib/bundleTypes';
import { FIXTURE } from './fixtures/bundle';

const R = 'fixture', B = 'main';

// These cover the port of internal/store/highlights.go onto the bundle: the
// impact (out-degree) count, the type exclusion and its empty-scope fallback,
// the top-N bound, the axis orderings, and the separation rule that picks a
// default axis. They also cover ref CLASSIFICATION, since impact and the
// 'fact' vs 'broken' distinction resolve refs by the same rule.

function fact(over: Partial<BundleFact> & { title: string }): BundleFact {
  return {
    body: '', domain: [], entities: [], refs: [], confidence: 0.5, sources: 1,
    ...over,
  };
}

/**
 * A synthesis citing three live facts, an observation citing none, and one
 * ref of every non-fact shape.
 *
 * `dup` is cited TWICE by the same synthesis, via a bare path and again in a
 * second entry — the distinctness of the target set is what impact counts, so
 * a fixture without a repeat could not tell a correct count from one that
 * totals refs.
 */
const S1 = 'kb/synth/s1.md';       // synthesis, cites o1, o2, dup (+ noise)
const S2 = 'kb/synth/s2.md';       // synthesis, cites o1 only
const O1 = 'kb/obs/o1.md';         // observation, no refs
const O2 = 'kb/obs/o2.md';         // observation, no refs
const DUP = 'kb/obs/dup.md';       // observation, no refs
const MISSING = 'kb/obs/gone.md';  // never in the tree — a broken ref target

const GRAPH: Bundle = {
  schemaVersion: FIXTURE.schemaVersion, repo: FIXTURE.repo, ref: FIXTURE.ref,
  head: 'c1',
  commits: [{ sha: 'c1', ts: 9000, author: 'Ada', subject: 'seed graph' }],
  trees: { c1: { [S1]: 'bs1', [S2]: 'bs2', [O1]: 'bo1', [O2]: 'bo2', [DUP]: 'bd' } },
  blobs: {
    bs1: fact({
      title: 'S1', type: 'synthesis', confidence: 0.7,
      refs: [
        O1, O2, DUP, DUP,                       // 3 distinct live targets
        MISSING,                                 // broken — resolves to nothing
        'kb://other12345/kb/x/y.md',             // foreign repo
        'src://repo/main.go@abc123',             // source code
        'https://example.com/spec',              // url
      ],
    }),
    bs2: fact({ title: 'S2', type: 'synthesis', confidence: 0.95, refs: [O1] }),
    bo1: fact({ title: 'O1', type: 'observation', confidence: 0.9 }),
    bo2: fact({ title: 'O2', type: 'observation', confidence: 0.8 }),
    bd: fact({ title: 'Dup', type: 'observation', confidence: 0.6 }),
  },
};

describe('highlights', () => {
  beforeEach(() => setBundle(GRAPH));

  it('counts impact as DISTINCT live fact targets, ignoring every other ref shape', async () => {
    const s = await api.stats(R, B, '');
    const byPath = Object.fromEntries(s.highlights.map(h => [h.path, h.impact]));
    // S1 lists eight refs: DUP twice, a broken path, and one each of foreign,
    // source and url. Only the three distinct LIVE fact paths are edges.
    expect(byPath[S1]).toBe(3);
    expect(byPath[S2]).toBe(1);
  });

  it('excludes observations and references from the list', async () => {
    const s = await api.stats(R, B, '');
    // The two syntheses only — the three observations are the substrate the
    // exclusion exists to keep out. Impact order, so S1 (3 edges) leads.
    expect(s.highlights.map(h => h.path)).toEqual([S1, S2]);
  });

  it('falls back to the excluded types when a scope has nothing else', async () => {
    // kb/obs holds only observations. Excluding them would delete the section
    // outright, and there is no distilled layer there for them to bury.
    const s = await api.stats(R, B, 'kb/obs');
    expect(s.highlights.map(h => h.path).sort()).toEqual([DUP, O1, O2].sort());
  });

  it('scopes the LIST by path but never the impact number', async () => {
    const all = await api.stats(R, B, '');
    const scoped = await api.stats(R, B, 'kb/synth');
    const impactOf = (s: typeof all, p: string) => s.highlights.find(h => h.path === p)!.impact;
    // Same fact, same number, from the root and from its own folder — the
    // property that makes impact verifiable by opening the fact's connections.
    expect(impactOf(scoped, S1)).toBe(impactOf(all, S1));
    expect(impactOf(scoped, S1)).toBe(3);
  });

  it('orders by the requested axis', async () => {
    // S1 has more impact; S2 has higher confidence. Each axis picks a
    // different leader, so neither ordering can pass by accident.
    expect((await api.stats(R, B, '', 'impact')).highlights[0].path).toBe(S1);
    expect((await api.stats(R, B, '', 'confidence')).highlights[0].path).toBe(S2);
  });

  it('caps the list at ten', async () => {
    const many: Bundle = {
      ...GRAPH,
      trees: { c1: {} }, blobs: {},
    };
    for (let i = 0; i < 25; i++) {
      const p = `kb/synth/m${i}.md`;
      many.trees.c1[p] = `bm${i}`;
      many.blobs[`bm${i}`] = fact({ title: `M${i}`, type: 'synthesis', confidence: i / 100 });
    }
    setBundle(many);
    expect((await api.stats(R, B, '')).highlights).toHaveLength(10);
  });
});

describe('default_axis', () => {
  it('is impact when observations carry no out-degree at all', async () => {
    // The agentic-engineering shape: every edge concentrated in the distilled
    // layer, so the separation is infinite and impact ranks meaningfully.
    setBundle(GRAPH);
    expect((await api.stats(R, B, '')).default_axis).toBe('impact');
  });

  it('is confidence when nothing in the top layer cites anything', async () => {
    const flat: Bundle = {
      ...GRAPH,
      trees: { c1: { [S1]: 'bs1', [O1]: 'bo1' } },
      blobs: {
        bs1: fact({ title: 'S1', type: 'synthesis', refs: [] }),
        bo1: fact({ title: 'O1', type: 'observation' }),
      },
    };
    setBundle(flat);
    expect((await api.stats(R, B, '')).default_axis).toBe('confidence');
  });

  it('is confidence when observations cite about as much as the top layer', async () => {
    // topMean 1.0 vs obsMean 1.0 — a ratio of 1, well under the 3.0 threshold,
    // so impact is not separating the layers and confidence is the better axis.
    const noisy: Bundle = {
      ...GRAPH,
      trees: { c1: { [S1]: 'bs1', [O1]: 'bo1', [O2]: 'bo2' } },
      blobs: {
        bs1: fact({ title: 'S1', type: 'synthesis', refs: [O1] }),
        bo1: fact({ title: 'O1', type: 'observation', refs: [O2] }),
        bo2: fact({ title: 'O2', type: 'observation', refs: [O1] }),
      },
    };
    setBundle(noisy);
    expect((await api.stats(R, B, '')).default_axis).toBe('confidence');
  });

  it('does not vary with the browsed path', async () => {
    // Repo-scoped by design: a folder dipping below the threshold must not
    // flip the control while the reader navigates.
    setBundle(GRAPH);
    const root = (await api.stats(R, B, '')).default_axis;
    expect((await api.stats(R, B, 'kb/obs')).default_axis).toBe(root);
    expect((await api.stats(R, B, 'kb/synth')).default_axis).toBe(root);
  });
});

describe('ref classification', () => {
  beforeEach(() => setBundle(GRAPH));

  it('labels each ref shape the way the server would', async () => {
    const f = await api.fact(R, B, S1);
    const kindOf = (raw: string) => f.refs.find(r => r.raw === raw)!.kind;
    expect(kindOf(O1)).toBe('fact');
    expect(kindOf(MISSING)).toBe('broken');
    expect(kindOf('kb://other12345/kb/x/y.md')).toBe('foreign');
    expect(kindOf('src://repo/main.go@abc123')).toBe('source_code');
    expect(kindOf('https://example.com/spec')).toBe('url');
  });

  it('carries a hop target on resolvable and broken refs only', async () => {
    const f = await api.fact(R, B, S1);
    const refOf = (raw: string) => f.refs.find(r => r.raw === raw)!;
    // FactBody's refTarget falls back to `raw`, so `path` is what makes a
    // clickable ref address a fact rather than a string.
    expect(refOf(O1).path).toBe(O1);
    expect(refOf(MISSING).path).toBe(MISSING);
    expect(refOf('https://example.com/spec').path).toBeUndefined();
  });

  it('classifies against the viewed commit, not HEAD', async () => {
    // Two commits: at c1 the target does not exist yet, at c2 it does. The
    // same ref must read 'broken' then 'fact' — FactBody promises a 'fact' ref
    // resolves AT THE VERSION BEING VIEWED, and a hop that 404s inside a
    // time-travel excursion is exactly what that promise rules out.
    const temporal: Bundle = {
      ...GRAPH,
      head: 'c2',
      commits: [
        { sha: 'c2', ts: 9100, author: 'Ada', subject: 'add target' },
        { sha: 'c1', ts: 9000, author: 'Ada', subject: 'citer only' },
      ],
      trees: {
        c1: { [S2]: 'bs2' },
        c2: { [S2]: 'bs2', [O1]: 'bo1' },
      },
      blobs: {
        bs2: fact({ title: 'S2', type: 'synthesis', refs: [O1] }),
        bo1: fact({ title: 'O1', type: 'observation' }),
      },
    };
    setBundle(temporal);
    expect((await api.fact(R, B, S2, 'c1')).refs[0].kind).toBe('broken');
    expect((await api.fact(R, B, S2, 'c2')).refs[0].kind).toBe('fact');
  });
});
