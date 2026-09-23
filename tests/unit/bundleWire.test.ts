import { describe, it, expect } from 'vitest';
import { encodeBundle } from '../../scripts/build-kb-bundle.mjs';
import { decodeBundle } from '../../src/lib/bundleWire';
import { FIXTURE } from './fixtures/bundle';

describe('bundle wire format', () => {
  it('round-trips trees through treeDeltas', () => {
    expect(decodeBundle(encodeBundle(FIXTURE))).toEqual(FIXTURE);
  });

  it('stores only changes, with null for removed paths', () => {
    const w = encodeBundle(FIXTURE);
    expect(w).not.toHaveProperty('trees');
    expect(w.treeDeltas).toEqual([
      // c3 vs c2: adr and g1 added, r1 retracted; a1 unchanged so absent
      { 'kb/architecture/adr.md': 'b5', 'kb/gotchas/g1.md': 'b3', 'kb/gotchas/r1.md': null },
      // c2 vs c1
      { 'kb/architecture/core/a1.md': 'b2', 'kb/gotchas/r1.md': 'b4' },
      // c1 vs empty
      { 'kb/architecture/core/a1.md': 'b1' },
    ]);
  });
});
