import { describe, it, expect, beforeEach } from 'vitest';
import { setBundle, api } from '../../src/lib/bundleApi';
import { FIXTURE } from './fixtures/bundle';

const R = 'fixture', B = 'main';
const A1 = 'kb/architecture/core/a1.md';
const R1 = 'kb/gotchas/r1.md';

beforeEach(() => setBundle(FIXTURE));

describe('api.factCommits', () => {
  it('returns only commits where the fact changed, newest-first', async () => {
    const h = await api.factCommits(R, B, A1);
    // a1 is b1 at c1 and b2 at c2; c3 leaves it untouched.
    expect(h.entries.map(e => e.commit)).toEqual(['c2', 'c1']);
  });

  it('marks the commit that removed a fact with the retract operation', async () => {
    const h = await api.factCommits(R, B, R1);
    // TimelineNav.tsx checks `entries[0].operation === 'retract'` verbatim
    // (isRetracted flag) to show the "no HEAD version" banner and the LAST
    // badge instead of HEAD — 'delete'/'deleted' would silently fail that
    // check. See task-4-report.md for the reconciliation.
    expect(h.entries[0]).toMatchObject({ commit: 'c3', operation: 'retract' });
  });

  it('reports no paging cursors for a fully-materialised history', async () => {
    const h = await api.factCommits(R, B, A1);
    expect(h.next).toBeUndefined();
    expect(h.prev).toBeUndefined();
  });
});

describe("api.fact with fallback: 'before'", () => {
  it('resolves the last valid version when the anchor is past a retraction', async () => {
    const fact = await api.fact(R, B, R1, 'c3', { fallback: 'before' });
    expect(fact.title).toBe('Retracted');
    expect(fact.commit_hash).toBe('c2');   // the version that still existed
    expect(fact.from_commit).toBe('c3');   // the anchor asked for
  });

  it('still rejects without the fallback option', async () => {
    await expect(api.fact(R, B, R1, 'c3')).rejects.toThrow(/not found/i);
  });

  it('rejects when the fact never existed at or before the anchor', async () => {
    await expect(api.fact(R, B, R1, 'c1', { fallback: 'before' })).rejects.toThrow(/not found/i);
  });

  it('rejects when the anchor commit itself is unknown to the bundle', async () => {
    await expect(api.fact(R, B, R1, 'no-such-sha', { fallback: 'before' })).rejects.toThrow(/not found/i);
  });
});

describe('api.factDiff', () => {
  it('returns both sides when the fact exists at each', async () => {
    const d = await api.factDiff(R, B, A1, 'c1', 'c3');
    expect(d.from?.title).toBe('Alpha');
    expect(d.to?.title).toBe('Alpha revised');
  });

  it('returns null for a side where the path is absent', async () => {
    const d = await api.factDiff(R, B, R1, 'c2', 'c3');
    expect(d.from?.title).toBe('Retracted');
    expect(d.to).toBeNull();
  });

  it('returns the same fact on both sides when from and to are identical', async () => {
    const d = await api.factDiff(R, B, A1, 'c1', 'c1');
    expect(d.from?.title).toBe('Alpha');
    expect(d.to?.title).toBe('Alpha');
  });
});

describe('api.commitDetail', () => {
  it('lists added, modified and deleted files against the parent commit', async () => {
    const d = await api.commitDetail(R, B, 'c3');
    expect(d.commit).toBe('c3');
    // Fixture's actual c3 subject (Task 3 added adr.md to this commit too).
    expect(d.message).toBe('add g1 and adr, retract r1');
    const byPath = Object.fromEntries(d.files.map(f => [f.path, f.action]));
    expect(byPath['kb/gotchas/g1.md']).toBe('added');
    expect(byPath['kb/architecture/adr.md']).toBe('added');
    expect(byPath['kb/gotchas/r1.md']).toBe('deleted');
    expect(byPath[A1]).toBeUndefined();     // unchanged between c2 and c3

    // A deleted file's title has to come from the PARENT tree's blob — the
    // blob no longer exists at the target commit — so this must be looked up
    // on the `a` (there/parent) side of the `z ?? a!` fallback, not the `z`
    // (here/target) side. Without this assertion, collapsing that lookup to
    // `z!` still passes every other assertion in this test (action alone
    // doesn't need the title) while silently blanking every deleted row's
    // title in TimelineNav.
    expect(d.files.find(f => f.path === 'kb/gotchas/r1.md')?.title).toBe('Retracted');
  });

  it('treats every file as added in the root commit', async () => {
    const d = await api.commitDetail(R, B, 'c1');
    expect(d.files).toEqual([{ path: A1, action: 'added', title: 'Alpha' }]);
  });
});
