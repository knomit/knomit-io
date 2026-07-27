import { describe, it, expect, beforeEach } from 'vitest';
import { setBundle, api } from '../../src/lib/bundleApi';
import type { Bundle } from '../../src/lib/bundleTypes';
import { FIXTURE } from './fixtures/bundle';

const R = 'fixture', B = 'main';
const A1 = 'kb/architecture/core/a1.md';
const ADR = 'kb/architecture/adr.md';
const G1 = 'kb/gotchas/g1.md';
const R1 = 'kb/gotchas/r1.md';

// The shared FIXTURE's three facts don't vary in kind/origin at all (none of
// a1/adr/g1 sets either), so a filter on those fields couldn't discriminate a
// broken implementation from a correct one there. This small bundle exists
// solely to exercise every opts field search/recent accept, each field
// splitting the three facts differently.
const P1 = 'kb/t/p1.md', P2 = 'kb/t/p2.md', P3 = 'kb/t/p3.md';
const OPTS_BUNDLE: Bundle = {
  schemaVersion: FIXTURE.schemaVersion, repo: FIXTURE.repo, ref: FIXTURE.ref, head: 'o1',
  commits: [{ sha: 'o1', ts: 5000, author: 'Ada', subject: 'seed opts fixture' }],
  trees: { o1: { [P1]: 'op1', [P2]: 'op2', [P3]: 'op3' } },
  blobs: {
    op1: {
      title: 'P1', body: 'alpha', type: 'pattern', kind: 'epistemic', origin: 'authored',
      domain: ['core'], entities: ['Widget'], refs: [], confidence: 0.9, sources: 1,
    },
    op2: {
      title: 'P2', body: 'beta', type: 'gotcha', kind: 'pragmatic', origin: 'discovered',
      domain: ['edge'], entities: ['Gadget'], refs: [], confidence: 0.3, sources: 1,
    },
    op3: {
      title: 'P3', body: 'gamma', type: 'decision', kind: 'epistemic', origin: 'distilled',
      domain: ['core', 'edge'], entities: [], refs: [], confidence: 0.6, sources: 1,
    },
  },
};

// A local extension of FIXTURE (spread, not a change to the shared fixture
// file) adding one fact whose refs change over time: `beta.md` exists since
// c1 referencing only a1, then at c2 — the same commit r1.md was added —
// beta's refs grow to also cite r1.md, and stay that way through HEAD.
// Combined with the fixture's existing r1.md (added c2, retracted c3) and
// a1.md (two versions, c1/c2), this is enough to exercise every anchor-aware
// case without touching HEAD's fact count or any other test's numbers: this
// bundle is only ever installed inside the tests below, each of which starts
// from `FIXTURE` again via `beforeEach`.
const BETA = 'kb/architecture/beta.md';
const BETA_BUNDLE: Bundle = {
  ...FIXTURE,
  trees: {
    ...FIXTURE.trees,
    c1: { ...FIXTURE.trees.c1, [BETA]: 'bb1' },
    c2: { ...FIXTURE.trees.c2, [BETA]: 'bb2' },
    c3: { ...FIXTURE.trees.c3, [BETA]: 'bb2' },
  },
  blobs: {
    ...FIXTURE.blobs,
    bb1: {
      title: 'Beta', body: 'beta references alpha', type: 'pattern',
      domain: ['core'], entities: [], refs: [A1], confidence: 0.5, sources: 1,
    },
    bb2: {
      title: 'Beta revised', body: 'beta now also cites a retracted note', type: 'pattern',
      domain: ['core'], entities: [], refs: [A1, R1], confidence: 0.5, sources: 1,
    },
  },
};

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
    // results[0].path === A1 alone doesn't prove title weighting: with the
    // title bonus zeroed out, a1 (body "alpha mentions widgets") and g1
    // (body "gamma cites alpha") both score 1 on the body-only term match,
    // tie, and the path tiebreak puts a1 first anyway ('kb/architecture...'
    // < 'kb/gotchas...'). Asserting the scores themselves differ is what
    // actually pins the title bonus.
    const a1Result = results.find(r => r.path === A1)!;
    const g1Result = results.find(r => r.path === G1)!;
    expect(a1Result.score).toBeGreaterThan(g1Result.score);
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

  // Table-driven coverage for every opts field besides `types` (already
  // covered above). The reviewer deleted all seven `opts` filter lines from
  // `recent` and 42/42 tests still passed — search's non-`types` fields had
  // the same gap (only `types` was exercised). Each row below uses a field
  // that actually varies across OPTS_BUNDLE's three facts, so a broken or
  // deleted filter changes the result set, not just its order.
  type SearchOpts = NonNullable<Parameters<typeof api.search>[5]>;
  const SEARCH_OPTS_CASES: Array<[string, number, SearchOpts, string[]]> = [
    ['minConfidence keeps only facts at or above the threshold', 0.5, {}, [P1, P3]],
    ['kinds narrows to the listed kind', 0, { kinds: ['pragmatic'] }, [P2]],
    ['excludeKinds drops the listed kind', 0, { excludeKinds: ['pragmatic'] }, [P1, P3]],
    ['origins narrows to the listed origin', 0, { origins: ['distilled'] }, [P3]],
    ['domains requires every listed domain to be present', 0, { domains: ['edge'] }, [P2, P3]],
    ['entities requires every listed entity to be present', 0, { entities: ['Gadget'] }, [P2]],
  ];

  describe('opts filters', () => {
    beforeEach(() => setBundle(OPTS_BUNDLE));

    it.each(SEARCH_OPTS_CASES)('%s', async (_label, minConfidence, opts, expected) => {
      const { results } = await api.search(R, B, '', '', minConfidence, opts);
      expect(results.map(r => r.path).sort()).toEqual([...expected].sort());
    });

    // The bundle has no episode data (Finding 6): an eps filter matches
    // nothing rather than silently matching everything.
    it('eps matches nothing (no episode data in the bundle)', async () => {
      const { results } = await api.search(R, B, '', '', 0, { eps: ['learn'] });
      expect(results).toEqual([]);
    });
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
  // what is really one connection. `outgoing` reads `fact.refs` directly (a raw
  // array — a fact whose refs array repeats the same target, or refs itself
  // twice, would otherwise produce duplicate entries), so `explain` runs it
  // through `dedupePaths`. `incoming`'s candidates come from `ix.allBacklinks`,
  // a `Set` per target, so they can't hold duplicates in the first place — this
  // also guards that side in case that ever changes.
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

// The user ruled that explain's anchor-blindness (title/type/versions/deleted
// all resolved at HEAD regardless of the requested commit) is a bug to fix,
// not a deferred design choice — see task-5-report.md's fix-report-round-2
// for the ruling and consequences (EdgesRail.tsx wrongly hatching a
// not-yet-retracted target; RightPanel.tsx:487-489 pinning in-body refs to a
// future version; incoming versions meaning "source changed" instead of
// upstream's "source asserted this edge"). These tests exercise the anchor
// resolution using BETA_BUNDLE; the un-anchored (HEAD) suite above is
// unmodified and still passes, which is the regression check for "HEAD
// behaviour must stay exactly as it is today."
describe('api.explain anchored at a historical commit', () => {
  beforeEach(() => setBundle(BETA_BUNDLE));

  // r1.md is alive at c2 (added there) and retracted at c3/HEAD. beta.md
  // references it starting at c2. Scrubbed to c2, r1 must NOT render as
  // retracted — EdgesRail.tsx:199/220 hatch and strike through `deleted`
  // rows, so getting this wrong shows a live-at-the-time fact as already
  // gone.
  it('does not mark a ref target as deleted at an anchor where it was still alive', async () => {
    const atC2 = await api.explain(R, B, BETA, 'c2');
    const r1AtC2 = atC2.outgoing.find(g => g.path === R1)!;
    expect(r1AtC2.deleted).toBe(false);
    expect(r1AtC2.title).toBe('Retracted');   // b4's literal title field
    expect(r1AtC2.type).toBe('observation');

    const atHead = await api.explain(R, B, BETA);   // no commit => HEAD
    const r1AtHead = atHead.outgoing.find(g => g.path === R1)!;
    expect(r1AtHead.deleted).toBe(true);
  });

  // a1.md has two versions (c1, c2 — c3 leaves it unchanged). Anchored at c1,
  // only c1 exists yet; anchored at HEAD, both do. RightPanel.tsx:487-489
  // pins in-body ref links to `versions[0].commit` — a post-anchor entry
  // there would send a reader to a revision they haven't reached yet.
  it('bounds a target\'s versions to commits at or before the anchor', async () => {
    const atC1 = await api.explain(R, B, BETA, 'c1');
    const a1AtC1 = atC1.outgoing.find(g => g.path === A1)!;
    expect(a1AtC1.versions.map(v => v.commit)).toEqual(['c1']);
    expect(a1AtC1.title).toBe('Alpha');

    const atHead = await api.explain(R, B, BETA);
    const a1AtHead = atHead.outgoing.find(g => g.path === A1)!;
    expect(a1AtHead.versions.map(v => v.commit)).toEqual(['c2', 'c1']);
    expect(a1AtHead.title).toBe('Alpha revised');
  });

  // beta's own refs grew between c1 and c2 (a1 only -> a1 and r1). The edge
  // beta->r1 must appear/disappear across anchors in BOTH directions: from
  // beta's own outgoing list, and from r1's incoming list (which — unlike
  // HEAD's backlinks index — has to notice a source whose ref didn't exist
  // yet at an older anchor).
  it('reflects a source\'s changing refs on both the outgoing and incoming sides', async () => {
    const outAtC1 = await api.explain(R, B, BETA, 'c1');
    expect(outAtC1.outgoing.map(g => g.path)).toEqual([A1]);   // r1 ref doesn't exist yet

    const outAtC2 = await api.explain(R, B, BETA, 'c2');
    expect(outAtC2.outgoing.map(g => g.path).sort()).toEqual([A1, R1].sort());

    const inAtC1 = await api.explain(R, B, R1, 'c1');
    expect(inAtC1.incoming).toEqual([]);   // beta doesn't cite r1 yet

    const inAtC2 = await api.explain(R, B, R1, 'c2');
    expect(inAtC2.incoming.map(g => g.path)).toEqual([BETA]);
  });

  // Upstream's groupRefs distinguishes "the source's commits that asserted
  // this edge" from "every commit that touched the source" (upstreamApi.ts:
  // 940-944). beta itself has two revisions (c1, c2) but only the c2 one
  // asserts the edge to r1, so r1's incoming versions for beta must list
  // only c2 — not c1, which changed beta but didn't cite r1.
  it('lists only the source revisions that actually asserted the edge, for incoming versions', async () => {
    const e = await api.explain(R, B, R1, 'c2');
    const betaGroup = e.incoming.find(g => g.path === BETA)!;
    expect(betaGroup.versions.map(v => v.commit)).toEqual(['c2']);
  });

  // beta only ever GAINS a ref to r1 (a1-only -> a1-and-r1, unchanged since).
  // That alone doesn't require scanning history for incoming candidates: r1
  // is still in beta's HEAD refs, so even a HEAD-only backlinks index would
  // still find beta. This test uses a source whose ref to r1 is later
  // REMOVED — present at c2, gone again by c3/HEAD — so a HEAD-only index
  // would never have listed it as a candidate for r1 at all, and only
  // KbIndex.allBacklinks's all-commit scan lets the c2-anchored query find it.
  it('finds a source whose ref to the target was removed again by HEAD, when scrubbed to before the removal', async () => {
    const CITER = 'kb/architecture/citer.md';
    setBundle({
      ...FIXTURE,
      trees: {
        ...FIXTURE.trees,
        c2: { ...FIXTURE.trees.c2, [CITER]: 'bc1' },
        c3: { ...FIXTURE.trees.c3, [CITER]: 'bc2' },
      },
      blobs: {
        ...FIXTURE.blobs,
        bc1: {
          title: 'Citer', body: 'cites the soon-to-be-retracted note', type: 'pattern',
          domain: [], entities: [], refs: [R1], confidence: 0.5, sources: 1,
        },
        bc2: {
          title: 'Citer revised', body: 'no longer cites it', type: 'pattern',
          domain: [], entities: [], refs: [], confidence: 0.5, sources: 1,
        },
      },
    });

    const atC2 = await api.explain(R, B, R1, 'c2');
    expect(atC2.incoming.map(g => g.path)).toEqual([CITER]);

    const atHead = await api.explain(R, B, R1);
    expect(atHead.incoming).toEqual([]);
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
  // Written as a literal (not the same `(0.9+0.5+0.5)/3` expression the
  // implementation itself uses) so the expectation doesn't just restate the
  // production arithmetic back at it: 1.9 / 3 = 0.6333333... independently.
  it('stats counts facts, domains and entities at HEAD', async () => {
    const s = await api.stats(R, B, 'kb');
    expect(s.total).toBe(3);
    expect(s.domains).toMatchObject({ core: 2 });
    expect(s.entities).toMatchObject({ Widget: 1 });
    expect(s.avg_confidence).toBeCloseTo(0.633333, 5);
  });

  // openapi.yaml types last_commit as date-time; RightPanel.tsx:627-628 feeds
  // it to `new Date(...)`/`relativeTime(...)`, which renders "Invalid Date"
  // for a bare SHA. c3's timestamp is 3000 (unix seconds).
  //
  // activity.total counts COMMITS touching the scope, not facts (matching
  // git/commitlog.go's CommitLogActivity: COUNT(DISTINCT commit_hash)) — see
  // the directory-scoped case below, where it legitimately differs from
  // stats.total for the same path.
  it('activity reports the head commit as an ISO date, and total as a commit count', async () => {
    const a = await api.activity(R, B, 'kb');
    expect(a.last_commit).toBe(new Date(3000 * 1000).toISOString());
    expect(a.total).toBe(3);   // all three fixture commits touch something under kb/
  });

  // A third type (adr's "decision") joined pattern/gotcha in the Task 3
  // fixture. No `.sort()` on the actual result here — completions already
  // returns them sorted; re-sorting the actual value in the assertion (as the
  // brief's original test did) would hide an unsorted implementation.
  it('completions returns distinct prefix-filtered frontmatter values, in order', async () => {
    expect((await api.completions(R, B, 'type')).values).toEqual(['decision', 'gotcha', 'pattern']);
    expect((await api.completions(R, B, 'type', 'pat')).values).toEqual(['pattern']);
    expect((await api.completions(R, B, 'entity')).values).toEqual(['Widget']);
  });

  // FilterBar.tsx's Path facet (FilterBar.tsx:20/205-224) has no equivalent
  // in domain/entity/type/kind/origin: it drills through directory segments
  // rather than frontmatter values. adr.md sits alongside the core/
  // subdirectory directly under kb/architecture (the fixture's own comment
  // calls this out), so this also proves a leaf at the queried level
  // contributes nothing while a subdirectory does.
  it('completions returns next-segment directory prefixes for the path category', async () => {
    expect((await api.completions(R, B, 'path', '')).values).toEqual(['kb']);
    expect((await api.completions(R, B, 'path', 'kb/')).values).toEqual(['kb/architecture', 'kb/gotchas']);
    // adr.md is a direct leaf of kb/architecture/ — no further segment — so
    // only core/ (which holds a1.md) shows up one level deeper.
    expect((await api.completions(R, B, 'path', 'kb/architecture/')).values).toEqual(['kb/architecture/core']);
  });

  // RightPanel.tsx:526-527 and Library.tsx:300/511 all pass the currently
  // browsed directory (state.ontologyRoot or a deeper "path" filter chip) as
  // the path argument, expecting the same subtree scoping browse() already
  // gives directory listings. Scoping to kb/architecture must exclude g1.
  it('scopes recent and stats to the requested directory subtree', async () => {
    const r = await api.recent(R, B, 'kb/architecture');
    expect(r.facts.map(f => f.path).sort()).toEqual([A1, ADR].sort());
    expect(r.total).toBe(2);

    const s = await api.stats(R, B, 'kb/gotchas');
    expect(s.total).toBe(1);
  });

  // activity.total is a commit count, not a fact count (see above), so it can
  // legitimately diverge from stats.total for the very same scope: only 2
  // facts live under kb/architecture at HEAD, but all 3 fixture commits
  // touched something there at some point (c1 added a1, c2 revised it, c3
  // added adr) — so scoping doesn't shrink it the way it shrinks stats.total.
  it('scopes activity.total to commits touching the subtree, independent of fact count', async () => {
    const a = await api.activity(R, B, 'kb/architecture');
    expect(a.total).toBe(3);
  });

  // Table-driven coverage for every `recent` opts field. The reviewer deleted
  // all seven `.filter(({fact}) => !opts?.…)` lines and 42/42 bundleApi tests
  // still passed — Library.tsx:300 passes typeFilter/kinds/origins/domains/
  // entities/eps on every recent-mode load, so this was live, untested code.
  describe('recent opts filters', () => {
    beforeEach(() => setBundle(OPTS_BUNDLE));

    type RecentOpts = NonNullable<Parameters<typeof api.recent>[6]>;
    const RECENT_OPTS_CASES: Array<[string, RecentOpts, string[]]> = [
      ['typeFilter narrows to the listed type', { typeFilter: 'gotcha' }, [P2]],
      ['excludeType drops the listed type', { excludeType: 'gotcha' }, [P1, P3]],
      ['kinds narrows to the listed kind', { kinds: ['epistemic'] }, [P1, P3]],
      ['excludeKinds drops the listed kind', { excludeKinds: ['epistemic'] }, [P2]],
      ['origins narrows to the listed origin', { origins: ['authored'] }, [P1]],
      ['domains requires every listed domain to be present', { domains: ['core'] }, [P1, P3]],
      ['entities requires every listed entity to be present', { entities: ['Widget'] }, [P1]],
    ];

    it.each(RECENT_OPTS_CASES)('%s', async (_label, opts, expected) => {
      const r = await api.recent(R, B, '', '', 50, 0, opts);
      expect(r.facts.map(f => f.path).sort()).toEqual([...expected].sort());
      expect(r.total).toBe(expected.length);
    });

    // Same eps decision as search (Finding 6): matches nothing, not everything.
    it('eps matches nothing (no episode data in the bundle)', async () => {
      const r = await api.recent(R, B, '', '', 50, 0, { eps: ['learn'] });
      expect(r.facts).toEqual([]);
      expect(r.total).toBe(0);
    });
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
