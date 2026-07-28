import type { Bundle, BundleFact } from '../../../src/lib/bundleTypes';

const f = (over: Partial<BundleFact>): BundleFact => ({
  title: 'Untitled', body: '', domain: [], entities: [], refs: [],
  confidence: 0.5, sources: 1, ...over,
});

/**
 * Three commits, four facts.
 *   c3 (head): a1 revised, g1 added (refs a1), adr added, r1 RETRACTED (absent from tree)
 *   c2:        a1 revised, r1 present
 *   c1:        a1 v1 only
 *
 * `kb/architecture/adr.md` exists only at HEAD and sits alongside the
 * `core/` directory under `kb/architecture` — the one level in this fixture
 * where a directory and a fact leaf coexist, so browse ordering (directories
 * before leaves) has something real to prove. Its name is chosen to sort
 * alphabetically *before* "core", so a naive alphabetical-only sort would put
 * it first — only directories-first logic gets the order right.
 */
export const FIXTURE: Bundle = {
  schemaVersion: 1,
  repo: 'knomit/fixture-kb',
  ref: 'main',
  head: 'c3',
  commits: [
    { sha: 'c3', ts: 3000, author: 'Ada', subject: 'add g1 and adr, retract r1' },
    { sha: 'c2', ts: 2000, author: 'Ada', subject: 'revise a1, add r1' },
    { sha: 'c1', ts: 1000, author: 'Ada', subject: 'add a1' },
  ],
  trees: {
    c3: {
      'kb/architecture/core/a1.md': 'b2',
      'kb/architecture/adr.md': 'b5',
      'kb/gotchas/g1.md': 'b3',
    },
    c2: { 'kb/architecture/core/a1.md': 'b2', 'kb/gotchas/r1.md': 'b4' },
    c1: { 'kb/architecture/core/a1.md': 'b1' },
  },
  blobs: {
    b1: f({ title: 'Alpha', type: 'pattern', body: 'first version of alpha', domain: ['core'] }),
    b2: f({ title: 'Alpha revised', type: 'pattern', body: 'alpha mentions widgets',
            domain: ['core'], entities: ['Widget'], confidence: 0.9 }),
    b3: f({ title: 'Gamma', type: 'gotcha', body: 'gamma cites alpha',
            refs: ['kb/architecture/core/a1.md', 'https://example.com/paper'] }),
    b4: f({ title: 'Retracted', type: 'observation', body: 'this one goes away' }),
    b5: f({ title: 'Adr', type: 'decision', body: 'why we picked this architecture',
            domain: ['core'] }),
  },
};
