import { describe, it, expect, beforeEach } from 'vitest';
import { setBundle, api } from '../../src/lib/bundleApi';
import { FIXTURE } from './fixtures/bundle';

const R = 'fixture', B = 'main';
const A1 = 'kb/architecture/core/a1.md';
const ADR = 'kb/architecture/adr.md';
const G1 = 'kb/gotchas/g1.md';
const R1 = 'kb/gotchas/r1.md';

beforeEach(() => setBundle(FIXTURE));

describe('api.search', () => {
  it('matches body text and returns a positive score', async () => {
    const { results } = await api.search(R, B, 'widgets');
    expect(results.map(r => r.path)).toEqual([A1]);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('ranks a title hit above a body-only hit', async () => {
    const { results } = await api.search(R, B, 'alpha');
    expect(results[0].path).toBe(A1);          // title "Alpha revised"
    expect(results.map(r => r.path)).toContain(G1);   // body "gamma cites alpha"
  });

  it('returns an empty list rather than throwing for no match', async () => {
    const { results } = await api.search(R, B, 'zzzznotpresent');
    expect(results).toEqual([]);
  });

  it('narrows by the type option', async () => {
    const { results } = await api.search(R, B, 'alpha', '', 0, { types: ['gotcha'] });
    expect(results.map(r => r.path)).toEqual([G1]);
  });

  // Library.tsx:339 passes the currently-browsed directory as the 4th
  // argument on every relevance-sort call, so a fact that matches the query
  // text but lives outside that directory must not surface. a1 mentions
  // "alpha" in its own body, but scoping to kb/gotchas must exclude it.
  it('scopes results to the requested directory subtree', async () => {
    const { results } = await api.search(R, B, 'alpha', 'kb/gotchas');
    expect(results.map(r => r.path)).toEqual([G1]);
  });
});

describe('api.explain', () => {
  it('returns outgoing kb refs and drops external URLs', async () => {
    const e = await api.explain(R, B, G1);
    expect(e.outgoing.map(g => g.path)).toEqual([A1]);
    expect(e.outgoing[0].title).toBe('Alpha revised');
  });

  it('returns incoming backlinks', async () => {
    const e = await api.explain(R, B, A1);
    expect(e.incoming.map(g => g.path)).toEqual([G1]);
  });

  it('populates versions newest-first for each group', async () => {
    const e = await api.explain(R, B, G1);
    expect(e.outgoing[0].versions.map(v => v.commit)).toEqual(['c2', 'c1']);
  });

  it('has no edges for a fact with none', async () => {
    setBundle({ ...FIXTURE, trees: { c3: { [A1]: 'b2' } }, head: 'c3' });
    const e = await api.explain(R, B, A1);
    expect(e.incoming).toEqual([]);
    expect(e.outgoing).toEqual([]);
  });

  // EdgesRail.tsx renders each RefGroup as `<EdgeGroup key={g.path}>` — a repeated
  // path in the source list would be a React key collision AND a doubled row for
  // what is really one connection. buildIndex (kbIndex.ts) pushes a source path
  // into `backlinks` once per matching ref, so a fact whose refs array repeats
  // the same target (or refs itself twice) produces duplicate entries on both
  // sides of explain — outgoing reads fact.refs directly, incoming reads
  // ix.backlinks, neither naturally deduped. explain collapses both to distinct
  // paths before building RefGroups.
  it('deduplicates repeated refs to the same target', async () => {
    setBundle({
      ...FIXTURE,
      trees: { c3: { 'kb/dup.md': 'bdup' } },
      blobs: {
        ...FIXTURE.blobs,
        bdup: {
          title: 'Dup', body: 'self-referential', domain: [], entities: [],
          refs: ['kb/dup.md', 'kb/dup.md'], confidence: 0.5, sources: 1,
        },
      },
      head: 'c3',
    });
    const e = await api.explain(R, B, 'kb/dup.md');
    expect(e.outgoing).toHaveLength(1);
    expect(e.incoming).toHaveLength(1);
  });

  // refGroup used to resolve a group's title/kind/type from whichever tree the
  // newest CHANGE touched, including a retraction commit — but a retraction
  // commit's tree has no entry for the retracted path, so that lookup silently
  // came back empty and the row fell back to the bare filename. It should
  // instead read the last commit where the path still existed (already
  // computed as `versions[0]` below).
  it('surfaces the last known title for a retracted ref target', async () => {
    setBundle({
      ...FIXTURE,
      trees: { ...FIXTURE.trees, c3: { ...FIXTURE.trees.c3, 'kb/architecture/note.md': 'bn' } },
      blobs: {
        ...FIXTURE.blobs,
        bn: {
          title: 'Note', body: 'refs a retracted fact', domain: [], entities: [],
          refs: [R1], confidence: 0.5, sources: 1,
        },
      },
    });
    const e = await api.explain(R, B, 'kb/architecture/note.md');
    expect(e.outgoing).toHaveLength(1);
    expect(e.outgoing[0].path).toBe(R1);
    expect(e.outgoing[0].title).toBe('Retracted');   // not "r1.md"
    expect(e.outgoing[0].type).toBe('observation');
    expect(e.outgoing[0].deleted).toBe(true);
    expect(e.outgoing[0].versions.map(v => v.commit)).toEqual(['c2']);
  });

  // RightPanel.tsx:483 anchors explain on a specific commit and, when that
  // anchor isn't the live HEAD, passes `{ fallback: 'before' }` — the brief's
  // draft `explain` had no such parameter at all (a real TS arity error: the
  // real call site passes 5 arguments). Mirrors `fact`'s own fallback: when
  // the fact scrubbed to no longer exists at the pinned commit, walk back to
  // the last commit where it did and read its edges, so the rail matches
  // whatever the fact panel is showing instead of going blank.
  it('falls back to the last valid version\'s edges when scrubbed past a retraction', async () => {
    setBundle({
      ...FIXTURE,
      trees: { ...FIXTURE.trees, c2: { ...FIXTURE.trees.c2, 'kb/gotchas/temp.md': 'btemp' } },
      blobs: {
        ...FIXTURE.blobs,
        btemp: { title: 'Temp', body: '', domain: [], entities: [], refs: [A1], confidence: 0.5, sources: 1 },
      },
    });
    // temp.md never existed at c3 in this override, so it reads like a fact
    // retracted before c3 — same shape as r1.md, just isolated to this test.
    const withoutFallback = await api.explain(R, B, 'kb/gotchas/temp.md', 'c3');
    expect(withoutFallback.outgoing).toEqual([]);

    const withFallback = await api.explain(R, B, 'kb/gotchas/temp.md', 'c3', { fallback: 'before' });
    expect(withFallback.outgoing.map(g => g.path)).toEqual([A1]);
  });
});

describe('api.recent / stats / activity / completions', () => {
  // Three HEAD facts as of the Task 3 fixture growth: a1 (last touched c2),
  // g1 and adr (both added at c3, so they tie on committed_at and fall
  // through to the path tiebreak: 'kb/architecture/adr.md' sorts before
  // 'kb/gotchas/g1.md' ('architecture' < 'gotchas'), so adr comes first,
  // then g1, then a1 last.
  it('recent lists HEAD facts newest-changed first', async () => {
    const r = await api.recent(R, B, 'kb');
    expect(r.facts.map(f => f.path)).toEqual([ADR, G1, A1]);
    expect(r.total).toBe(3);
  });

  // The assertion above alone doesn't prove the path tiebreak: adr and g1 tie
  // on committed_at, but Array.sort is stable and Object.keys(tree) already
  // yields them in the order [a1, adr, g1] — the same order a correct
  // ascending-path tiebreak produces, so a sort with the tiebreak DELETED
  // still passes it by coincidence. This bundle puts the alphabetically-first
  // path (kb/a-first.md) SECOND in tree insertion order, so only an explicit
  // tiebreak — not insertion order — can put it first in the result.
  it('breaks a committed_at tie by ascending path, not tree insertion order', async () => {
    setBundle({
      schemaVersion: FIXTURE.schemaVersion, repo: FIXTURE.repo, ref: FIXTURE.ref, head: 'c1',
      commits: [{ sha: 'c1', ts: 1000, author: 'Ada', subject: 'add both' }],
      trees: { c1: { 'kb/z-second.md': 'bz', 'kb/a-first.md': 'ba' } },
      blobs: {
        bz: { title: 'Z', body: '', domain: [], entities: [], refs: [], confidence: 0.5, sources: 1 },
        ba: { title: 'A', body: '', domain: [], entities: [], refs: [], confidence: 0.5, sources: 1 },
      },
    });
    const r = await api.recent(R, B, 'kb');
    expect(r.facts.map(f => f.path)).toEqual(['kb/a-first.md', 'kb/z-second.md']);
  });

  // total=3 (a1, adr, g1); domains: core appears on a1 and adr => 2;
  // entities: Widget only on a1 => 1; avg_confidence = (0.9 + 0.5 + 0.5) / 3.
  it('stats counts facts, domains and entities at HEAD', async () => {
    const s = await api.stats(R, B, 'kb');
    expect(s.total).toBe(3);
    expect(s.domains).toMatchObject({ core: 2 });
    expect(s.entities).toMatchObject({ Widget: 1 });
    expect(s.avg_confidence).toBeCloseTo((0.9 + 0.5 + 0.5) / 3, 5);
  });

  it('activity reports the head commit and total', async () => {
    const a = await api.activity(R, B, 'kb');
    expect(a.last_commit).toBe('c3');
    expect(a.total).toBe(3);
  });

  // A third type (adr's "decision") joined pattern/gotcha in the Task 3 fixture.
  it('completions returns distinct prefix-filtered frontmatter values', async () => {
    expect((await api.completions(R, B, 'type')).values.sort()).toEqual(['decision', 'gotcha', 'pattern']);
    expect((await api.completions(R, B, 'type', 'pat')).values).toEqual(['pattern']);
    expect((await api.completions(R, B, 'entity')).values).toEqual(['Widget']);
  });

  // RightPanel.tsx:526-527 and Library.tsx:300/511 all pass the currently
  // browsed directory (state.ontologyRoot or a deeper "path" filter chip) as
  // the path argument, expecting the same subtree scoping browse() already
  // gives directory listings. Scoping to kb/architecture must exclude g1.
  it('scopes recent and activity to the requested directory subtree', async () => {
    const r = await api.recent(R, B, 'kb/architecture');
    expect(r.facts.map(f => f.path).sort()).toEqual([A1, ADR].sort());
    expect(r.total).toBe(2);

    const s = await api.stats(R, B, 'kb/gotchas');
    expect(s.total).toBe(1);

    const a = await api.activity(R, B, 'kb/architecture');
    expect(a.total).toBe(2);
  });
});

describe('unreachable methods', () => {
  it('rejects writes', async () => {
    await expect(api.updateFact(R, B, A1, 'x')).rejects.toThrow(/read-only/i);
    await expect(api.retractFact(R, B, A1)).rejects.toThrow(/read-only/i);
  });

  it('rejects lens reads', async () => {
    await expect(api.lensBrowse('l', 'kb', 'kb')).rejects.toThrow(/lens/i);
    await expect(api.lensSearch('l', 'q', ['r1'])).rejects.toThrow(/lens/i);
    await expect(api.listLensFacts('l', {})).rejects.toThrow(/lens/i);
    await expect(api.getLensFact('l', A1)).rejects.toThrow(/lens/i);
    await expect(api.getLensStats('l', 'kb')).rejects.toThrow(/lens/i);
    await expect(api.lensCompletions('l', 'type', '')).rejects.toThrow(/lens/i);
  });
});
