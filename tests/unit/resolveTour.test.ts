import { describe, it, expect } from 'vitest';
import { resolveTour } from '../../scripts/build-kb-bundle.mjs';

type Blob = {
  title: string; body: string; type?: string;
  domain: string[]; entities: string[]; refs: string[];
  confidence: number; sources: number;
};

const f = (over: Partial<Blob>): Blob => ({
  title: 't', body: '', domain: [], entities: [], refs: [],
  confidence: 0.5, sources: 1, ...over,
});

/** Commits are newest-first, matching the bundle's own ordering. */
const commits = [{ sha: 'c3' }, { sha: 'c2' }, { sha: 'c1' }];

describe('resolveTour', () => {
  it('picks a synthesis whose cited fact has more than one version', () => {
    const trees = {
      c3: { 'kb/s.md': 'bs', 'kb/t.md': 'bt2' },
      c2: { 'kb/s.md': 'bs', 'kb/t.md': 'bt1' },
      c1: { 'kb/s.md': 'bs' },
    };
    const blobs = {
      bs: f({ type: 'synthesis', entities: ['Widget'], refs: ['kb/t.md'] }),
      bt1: f({ title: 'target v1' }),
      bt2: f({ title: 'target v2' }),
    };
    expect(resolveTour(commits, trees, blobs)).toEqual({
      synthesis: 'kb/s.md',
      target: 'kb/t.md',
      // oldest-first, so the tour can scrub to the beginning
      targetVersions: ['c2', 'c3'],
      entity: 'Widget',
    });
  });

  it('returns undefined when every cited fact is single-version', () => {
    const trees = {
      c3: { 'kb/s.md': 'bs', 'kb/t.md': 'bt' },
      c2: { 'kb/s.md': 'bs', 'kb/t.md': 'bt' },
      c1: { 'kb/s.md': 'bs', 'kb/t.md': 'bt' },
    };
    const blobs = {
      bs: f({ type: 'synthesis', entities: ['Widget'], refs: ['kb/t.md'] }),
      bt: f({}),
    };
    // The tour's time-travel step would have nothing to show, so the whole
    // affordance is withheld rather than shipped half-working.
    expect(resolveTour(commits, trees, blobs)).toBeUndefined();
  });

  it('skips a synthesis with no entities — the filter step needs one to click', () => {
    const trees = { c3: { 'kb/s.md': 'bs', 'kb/t.md': 'bt2' }, c2: { 'kb/t.md': 'bt1' }, c1: {} };
    const blobs = {
      bs: f({ type: 'synthesis', entities: [], refs: ['kb/t.md'] }),
      bt1: f({}), bt2: f({}),
    };
    expect(resolveTour(commits, trees, blobs)).toBeUndefined();
  });

  it('ignores non-synthesis facts and external refs', () => {
    const trees = { c3: { 'kb/o.md': 'bo', 'kb/t.md': 'bt2' }, c2: { 'kb/t.md': 'bt1' }, c1: {} };
    const blobs = {
      bo: f({ type: 'observation', entities: ['Widget'], refs: ['kb/t.md'] }),
      bt1: f({}), bt2: f({}),
    };
    expect(resolveTour(commits, trees, blobs)).toBeUndefined();

    // The external-ref half needs a URL that WOULD otherwise qualify — i.e.
    // one present in the head tree with multiple versions — or `!head[target]`
    // alone rejects it and the `startsWith('kb/')` guard is never exercised.
    // As originally written this assertion survived deleting that guard.
    const extTrees = {
      c3: { 'kb/s.md': 'bs', 'https://example.com/paper': 'p2' },
      c2: { 'https://example.com/paper': 'p1' },
      c1: {},
    };
    const external = {
      bs: f({ type: 'synthesis', entities: ['Widget'], refs: ['https://example.com/paper'] }),
      p1: f({}), p2: f({}),
    };
    expect(resolveTour(commits, extTrees, external)).toBeUndefined();
  });

  it('prefers the target with the most versions, so the change is most visible', () => {
    const trees = {
      c3: { 'kb/s.md': 'bs', 'kb/few.md': 'f2', 'kb/many.md': 'm3' },
      c2: { 'kb/s.md': 'bs', 'kb/few.md': 'f1', 'kb/many.md': 'm2' },
      c1: { 'kb/s.md': 'bs', 'kb/many.md': 'm1' },
    };
    const blobs = {
      bs: f({ type: 'synthesis', entities: ['Widget'], refs: ['kb/few.md', 'kb/many.md'] }),
      f1: f({}), f2: f({}), m1: f({}), m2: f({}), m3: f({}),
    };
    const tour = resolveTour(commits, trees, blobs)!;
    expect(tour.target).toBe('kb/many.md');
    expect(tour.targetVersions).toHaveLength(3);
  });

  it('is deterministic, so an unchanged KB rebuilds to the same content hash', () => {
    const trees = {
      c3: { 'kb/b.md': 'bb', 'kb/a.md': 'ba', 'kb/t.md': 't2' },
      c2: { 'kb/t.md': 't1' }, c1: {},
    };
    const blobs = {
      ba: f({ type: 'synthesis', entities: ['A'], refs: ['kb/t.md'] }),
      bb: f({ type: 'synthesis', entities: ['B'], refs: ['kb/t.md'] }),
      t1: f({}), t2: f({}),
    };
    const first = resolveTour(commits, trees, blobs);
    // Same inputs, keys re-inserted in a different order.
    const reordered = { c3: { 'kb/a.md': 'ba', 'kb/t.md': 't2', 'kb/b.md': 'bb' }, c2: { 'kb/t.md': 't1' }, c1: {} };
    expect(resolveTour(commits, reordered, blobs)).toEqual(first);
    expect(first!.synthesis).toBe('kb/a.md');   // sorted, not insertion-ordered
  });
});
