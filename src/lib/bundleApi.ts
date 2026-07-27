import type { Bundle, BundleFact } from './bundleTypes';
import { BUNDLE_SCHEMA_VERSION } from './bundleTypes';
import { buildIndex, tokenize, type KbIndex } from './kbIndex';
import {
  parseSearchQuery,
  type Fact, type DirChild, type BrowseResponse, type HistoryResponse,
  type CommitDetail, type CommitFile, type SearchResult, type RefGroup,
  type RefVersion, type RecentResponse, type Stats, type ActivityStats,
  type LensFactEntry, type LensSource, type LensStats, type LensBrowseResponse,
} from '../generated/kb-ui/upstreamApi';

let bundle: Bundle | null = null;
let index: KbIndex | null = null;

/** Install the active bundle. Every api method throws until this is called. */
export function setBundle(b: Bundle): void {
  bundle = b ?? null;
  index = b ? buildIndex(b) : null;
}

export function assertSchema(b: Bundle): void {
  if (b?.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    throw new Error(`bundle schemaVersion ${b?.schemaVersion} != ${BUNDLE_SCHEMA_VERSION}`);
  }
}

function state(): { b: Bundle; ix: KbIndex } {
  if (!bundle || !index) throw new Error('bundle not loaded');
  return { b: bundle, ix: index };
}

function treeAt(b: Bundle, commit?: string): Record<string, string> {
  return b.trees[commit ?? b.head] ?? {};
}

function toFact(path: string, blob: BundleFact, commit: string, ts: number): Fact {
  return {
    path, title: blob.title, kind: blob.kind, type: blob.type, origin: blob.origin,
    body: blob.body, domain: blob.domain, confidence: blob.confidence,
    sources: blob.sources, entities: blob.entities, refs: blob.refs,
    parse_error: blob.parse_error,
    commit_hash: commit,
    commit_date: new Date(ts * 1000).toISOString(),
  };
}

function commitTs(b: Bundle, sha: string): number {
  return b.commits.find(c => c.sha === sha)?.ts ?? 0;
}

/** Read a fact at a tree, or null when the path is absent from it. */
function readAt(b: Bundle, path: string, commit: string): Fact | null {
  const sha = treeAt(b, commit)[path];
  if (!sha) return null;
  const blob = b.blobs[sha];
  if (!blob) return null;
  return toFact(path, blob, commit, commitTs(b, commit));
}

/** Commits are newest-first, so index+1 is the parent. */
function parentOf(b: Bundle, sha: string): string | null {
  const i = b.commits.findIndex(c => c.sha === sha);
  return i === -1 || i + 1 >= b.commits.length ? null : b.commits[i + 1].sha;
}

/** Index of `sha` in `b.commits` (newest-first) — -1 if unknown. Since the
 *  array is newest-first, "at or before commit X" is exactly "index >=
 *  commitIndex(b, X)"; used throughout `explain`'s anchor resolution. */
function commitIndex(b: Bundle, sha: string): number {
  return b.commits.findIndex(c => c.sha === sha);
}

type Op = 'added' | 'modified' | 'deleted';

/** Every commit where `path`'s blob differs from its parent's, newest-first. */
function changesFor(b: Bundle, path: string): Array<{ sha: string; op: Op }> {
  const out: Array<{ sha: string; op: Op }> = [];
  for (const c of b.commits) {
    const here = b.trees[c.sha]?.[path];
    const parent = parentOf(b, c.sha);
    const there = parent ? b.trees[parent]?.[path] : undefined;
    if (here === there) continue;
    if (here && !there) out.push({ sha: c.sha, op: 'added' });
    else if (!here && there) out.push({ sha: c.sha, op: 'deleted' });
    else out.push({ sha: c.sha, op: 'modified' });
  }
  return out;
}

// factCommits' history-entry vocabulary calls a removal 'retract' (matching
// the fact-retraction language used everywhere else in the vendored UI —
// RetractIcon, api.retractFact, the "retracted at" badge): TimelineNav.tsx's
// isRetracted flag checks `entries[0].operation === 'retract'` verbatim, and
// a plain 'deleted' would leave that check permanently false, so scrubbing to
// a retracted fact's history would never show the "no HEAD version" banner.
// commitDetail's CommitFile.action keeps the raw Op term ('deleted') instead
// — TimelineNav checks `f.action === 'deleted'` there — so the two fields
// intentionally use different vocabularies for the same underlying event.
function historyOperation(op: Op): string {
  return op === 'deleted' ? 'retract' : op;
}

function headFacts(b: Bundle): Array<{ path: string; fact: BundleFact }> {
  const tree = treeAt(b);
  return Object.keys(tree)
    .map(path => ({ path, fact: b.blobs[tree[path]] }))
    .filter((x): x is { path: string; fact: BundleFact } => Boolean(x.fact));
}

// Every scoped query (search/recent/stats/activity) receives the currently
// browsed directory the same way browse() does (RightPanel.tsx:526-527,
// Library.tsx:300/339/511 all pass state's "path" — the ontology root, or a
// deeper "path" filter chip once the user navigates into a subdirectory).
// Without this, switching to Recent/Relevance sort inside a subdirectory
// would silently show facts from the whole tree instead of that subtree.
function scopedFacts(b: Bundle, dirPath: string): Array<{ path: string; fact: BundleFact }> {
  if (!dirPath) return headFacts(b);   // '' means unscoped (root), not "no paths match"
  const prefix = `${dirPath}/`;
  return headFacts(b).filter(({ path }) => path.startsWith(prefix));
}

/** Newest commit that touched each HEAD path. */
function lastTouched(b: Bundle, path: string): number {
  const change = changesFor(b, path)[0];
  return change ? (b.commits.find(c => c.sha === change.sha)?.ts ?? 0) : 0;
}

/** Count of commits with at least one file change under `dirPath`'s subtree —
 *  the real basis for `activity.total` (git/commitlog.go's CommitLogActivity:
 *  `COUNT(DISTINCT cl.commit_hash)` scoped by path), not a fact count.
 *  RightPanel.tsx:617/637 assigns `activity.total` to `totalCommits` and
 *  labels it "Commits" next to the "Facts" tile — reusing `scopedFacts(...)
 *  .length` there visibly duplicated the facts count instead of counting
 *  commits. */
function commitsTouching(b: Bundle, dirPath: string): number {
  const prefix = dirPath ? `${dirPath}/` : '';
  let count = 0;
  for (const c of b.commits) {
    const here = b.trees[c.sha] ?? {};
    const parent = parentOf(b, c.sha);
    const there = parent ? (b.trees[parent] ?? {}) : {};
    for (const p of new Set([...Object.keys(here), ...Object.keys(there)])) {
      if (prefix && !p.startsWith(prefix)) continue;
      if (here[p] !== there[p]) { count++; break; }
    }
  }
  return count;
}

/** Path completions return the next directory SEGMENT beneath `prefix`, as a
 *  full accumulated path (e.g. prefix 'kb/' -> 'kb/architecture') — matching
 *  the server's completions handler (internal/store/index.go's "path" case:
 *  group rows by the slice up to the next '/' after the prefix) and
 *  FilterBar's drill-down, which displays only the last segment
 *  (`v.split('/').pop()`, FilterBar.tsx:432) but drills using the full value
 *  (`drillIntoPath(v)`, FilterBar.tsx:449). A fact that's a direct leaf of
 *  `prefix` (no further '/') contributes nothing — path completions name
 *  directories, not facts. */
function nextPathSegments(tree: Record<string, string>, prefix: string): string[] {
  const dirs = new Set<string>();
  for (const path of Object.keys(tree)) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) continue;
    dirs.add(path.slice(0, prefix.length + slash));
  }
  return [...dirs].sort();
}

/** Title-weighted token overlap. The UI only reads `score`, never its provenance. */
function scoreFact(fact: BundleFact, terms: string[]): number {
  const title = new Set(tokenize(fact.title));
  const body = new Set(tokenize(fact.body));
  let score = 0;
  for (const t of terms) {
    if (title.has(t)) score += 3;
    if (body.has(t)) score += 1;
  }
  return score;
}

/** First occurrence of each path, order preserved. EdgesRail keys rows by
 *  `group.path` (`key={g.path}` in EdgeGroup), so a source pushing the same
 *  kb/ ref twice — or a self-ref — must collapse to one row, not one per
 *  occurrence. Applied in `explain` to `outgoing`, which reads `fact.refs`
 *  directly (buildIndex doesn't dedupe it); `incoming`'s candidates come from
 *  `ix.allBacklinks`, a `Set` per target, so they're already deduped there. */
function dedupePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

/** Build a RefGroup for `path` as of `anchorIdx` (an index into `b.commits`,
 *  which is newest-first, so `anchorIdx` and every LARGER index is "at or
 *  before" it) — title/kind/type/deleted/versions all resolve at or before
 *  the anchor, never at HEAD. Passing `anchorIdx = 0` (HEAD's own index,
 *  since HEAD is always the newest commit) reproduces the old HEAD-only
 *  behaviour exactly: every commit index is >= 0, so nothing is filtered out,
 *  and the "at anchor" tree lookup below is the same as the old "at HEAD" one.
 *
 *  Without this bound: scrubbing to an older commit would render an edge
 *  target that's retracted LATER as already retracted (EdgesRail.tsx:199/220
 *  hatch and strike through `deleted` rows), list versions from AFTER the
 *  anchor (RightPanel.tsx:487-489 pins in-body ref links to `versions[0]`,
 *  so a future version would win over the one actually cited), and would
 *  read the wrong tree for a retracted target's fallback title. */
function refGroup(b: Bundle, path: string, anchorIdx: number): RefGroup {
  const versions: RefVersion[] = changesFor(b, path)
    .filter(c => c.op !== 'deleted')
    .filter(c => commitIndex(b, c.sha) >= anchorIdx)
    .map(({ sha }) => {
      const blob = b.blobs[b.trees[sha][path]];
      return {
        commit: sha,
        committed_at: b.commits.find(c => c.sha === sha)?.ts,
        kind: blob?.kind, type: blob?.type,
      };
    });
  const anchorSha = b.commits[anchorIdx]?.sha ?? b.head;
  const atAnchorSha = treeAt(b, anchorSha)[path];
  const atAnchor = atAnchorSha ? b.blobs[atAnchorSha] : undefined;
  // When the target is retracted (at or before the anchor), atAnchorSha is
  // absent and there's no tree entry to read at the RETRACTION commit either
  // (that commit's tree has no entry for a path it just removed) — so this
  // must fall back to `versions[0]`, the newest commit at-or-before the
  // anchor where the path still existed, not the newest change overall.
  const latestVersion = versions[0];
  const latestSha = latestVersion ? b.trees[latestVersion.commit]?.[path] : undefined;
  const latest = atAnchor ?? (latestSha ? b.blobs[latestSha] : undefined);
  return {
    path,
    title: latest?.title ?? path.split('/').pop() ?? path,
    kind: latest?.kind, type: latest?.type,
    versions,
    deleted: !atAnchorSha,
  };
}

/** Whether `sourcePath`'s state AT `anchorSha` (not at HEAD, not "ever")
 *  currently references `targetPath`. The gate for whether a candidate from
 *  `KbIndex.allBacklinks` (an all-time superset) belongs in `targetPath`'s
 *  incoming list at this anchor at all — a source whose ref to the target was
 *  since removed (at or before the anchor) must not surface just because an
 *  OLDER revision of it once asserted the edge; nor should a source that
 *  doesn't exist yet, or was itself retracted by the anchor. Trees are full
 *  snapshots, so this is a direct lookup, not a walk through history. */
function currentlyAsserts(b: Bundle, sourcePath: string, targetPath: string, anchorSha: string): boolean {
  const sha = treeAt(b, anchorSha)[sourcePath];
  const blob = sha ? b.blobs[sha] : undefined;
  return blob?.refs.includes(targetPath) ?? false;
}

/** The source's own revisions (at or before the anchor) whose refs actually
 *  included `targetPath` at that revision — upstream's groupRefs semantics
 *  for incoming edges ("different source_commits = different versions of the
 *  source asserting the same target", upstreamApi.ts:940-944), not every
 *  commit that touched the source regardless of what its refs said then
 *  (which is what the source's own unfiltered change history gives). Only
 *  called after `currentlyAsserts` has confirmed the newest such revision
 *  qualifies, so the result is never empty when it's used. */
function assertingVersions(
  b: Bundle, sourcePath: string, targetPath: string, anchorIdx: number,
): RefVersion[] {
  return changesFor(b, sourcePath)
    .filter(c => c.op !== 'deleted')
    .filter(c => commitIndex(b, c.sha) >= anchorIdx)
    .map(({ sha }) => ({ sha, blob: b.blobs[b.trees[sha][sourcePath]] }))
    .filter(({ blob }) => blob?.refs.includes(targetPath))
    .map(({ sha, blob }) => ({
      commit: sha,
      committed_at: b.commits.find(c => c.sha === sha)?.ts,
      kind: blob?.kind, type: blob?.type,
    }));
}

// Generic over T (rather than the brief's Promise<never>) so each call site's
// `.then(r => r.facts)`/`.then(f => f.source)` still type-checks against the
// real shape it would get from a live lens/write endpoint — `never` made every
// such property read a type error, since nothing is assignable FROM `never`.
const readOnly = <T,>(what: string) => async (..._args: unknown[]): Promise<T> => {
  throw new Error(`${what} is unavailable: /explore is read-only`);
};
const noLens = <T,>(what: string) => async (..._args: unknown[]): Promise<T> => {
  throw new Error(`${what} is unavailable: /explore browses a single repo, not a lens`);
};

export const api = {
  // ontologyRoot is unused: bundle tree keys are already full paths (e.g.
  // "kb/architecture/core/a1.md"), and dirPath arrives already prefixed with
  // it (Library.tsx passes state.ontologyRoot as both dirPath's root and this
  // argument), so `${dirPath}/` alone is the right prefix at every level,
  // root included. Kept in the signature to match the interface Task 4/5
  // and the vendored UI call sites expect.
  browse: async (
    _repo: string, _branch: string, dirPath: string, _ontologyRoot: string,
  ): Promise<BrowseResponse> => {
    const { b } = state();
    const tree = treeAt(b);
    const prefix = `${dirPath}/`;

    const dirs = new Set<string>();
    const leaves: DirChild[] = [];

    for (const path of Object.keys(tree)) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) {
        const blob = b.blobs[tree[path]];
        leaves.push({ name: rest, is_dir: false, type: blob?.type, title: blob?.title, fullPath: path });
      } else {
        dirs.add(rest.slice(0, slash));
      }
    }

    const children: DirChild[] = [
      ...[...dirs].sort().map(name => ({ name, is_dir: true })),
      ...leaves.sort((x, y) => x.name.localeCompare(y.name)),
    ];
    return { path: dirPath, children };
  },

  fact: async (
    _repo: string, _branch: string, path: string, commit?: string,
    opts?: { fallback?: 'before' },
  ): Promise<Fact> => {
    const { b } = state();
    const at = commit ?? b.head;

    const direct = readAt(b, path, at);
    if (direct) return direct;

    // ?fallback=before — the anchor is past a retraction, so walk back to the
    // last commit at or before it where the fact still existed. Without this,
    // scrubbing past a retraction empties the panel instead of showing the
    // version the referrer saw.
    if (commit && opts?.fallback === 'before') {
      const from = b.commits.findIndex(c => c.sha === at);
      if (from !== -1) {
        for (const c of b.commits.slice(from)) {     // newest-first == walking backwards in time
          const older = readAt(b, path, c.sha);
          if (older) return { ...older, from_commit: at };
        }
      }
    }
    throw new Error(`fact not found at ${at}: ${path}`);
  },

  factCommits: async (
    _repo: string, _branch: string, path: string,
  ): Promise<HistoryResponse> => {
    const { b } = state();
    const entries = changesFor(b, path).map(({ sha, op }) => {
      const c = b.commits.find(x => x.sha === sha)!;
      return {
        commit: sha,
        date: new Date(c.ts * 1000).toISOString(),
        message: c.subject,
        operation: historyOperation(op),
      };
    });
    // The whole history is in memory, so there is nothing to page.
    return { entries };
  },

  factDiff: async (
    _repo: string, _branch: string, path: string, from: string, to: string,
    // FactDiffView.tsx:40 passes an AbortController#signal to cancel a
    // superseded diff request. Every read here is a synchronous in-memory
    // lookup, so there's nothing in flight to abort — accepted for arity
    // parity with the real fetch-based implementation only.
    _signal?: AbortSignal,
  ): Promise<{ from: Fact | null; to: Fact | null }> => {
    const { b } = state();
    return { from: readAt(b, path, from), to: readAt(b, path, to) };
  },

  commitDetail: async (
    _repo: string, _branch: string, hash: string,
  ): Promise<CommitDetail> => {
    const { b } = state();
    const c = b.commits.find(x => x.sha === hash);
    if (!c) throw new Error(`commit not found: ${hash}`);

    const here = b.trees[hash] ?? {};
    const parent = parentOf(b, hash);
    const there = parent ? (b.trees[parent] ?? {}) : {};

    const files: CommitFile[] = [];
    for (const p of new Set([...Object.keys(here), ...Object.keys(there)])) {
      const a = there[p], z = here[p];
      if (a === z) continue;
      const action: Op = z && !a ? 'added' : !z && a ? 'deleted' : 'modified';
      files.push({ path: p, action, title: b.blobs[z ?? a!]?.title });
    }
    files.sort((x, y) => x.path.localeCompare(y.path));

    return {
      commit: hash,
      date: new Date(c.ts * 1000).toISOString(),
      message: c.subject,
      author: { name: c.author, email: '' },
      files,
    };
  },

  search: async (
    _repo: string, _branch: string, q: string, path = '', minConfidence = 0,
    opts?: { types?: string[]; kinds?: string[]; excludeKinds?: string[];
             origins?: string[]; eps?: string[]; domains?: string[]; entities?: string[] },
  ): Promise<{ results: SearchResult[] }> => {
    const { b } = state();
    // eps (operation tags: learn/update/retract/subsume/synthesize/sync) has
    // no equivalent in the bundle — BundleFact carries only the CURRENT
    // frontmatter, not a per-commit operation tag, and guessing a mapping
    // (e.g. "modified" -> "update") would fabricate data for tags Op can't
    // express at all (subsume/synthesize/sync). Returning nothing is honest
    // about that gap; the previous silent-ignore behavior matched everything,
    // which looked like a real filter and wasn't (see report Finding 6).
    if (opts?.eps?.length) return { results: [] };
    const { text, domains, entities } = parseSearchQuery(q);
    const terms = tokenize(text);
    const wantDomains = [...domains, ...(opts?.domains ?? [])];
    const wantEntities = [...entities, ...(opts?.entities ?? [])];

    const results: SearchResult[] = [];
    for (const { path: p, fact } of scopedFacts(b, path)) {
      if (fact.confidence < minConfidence) continue;
      if (opts?.types?.length && !opts.types.includes(fact.type ?? '')) continue;
      if (opts?.kinds?.length && !opts.kinds.includes(fact.kind ?? '')) continue;
      if (opts?.excludeKinds?.length && opts.excludeKinds.includes(fact.kind ?? '')) continue;
      if (opts?.origins?.length && !opts.origins.includes(fact.origin ?? '')) continue;
      if (wantDomains.length && !wantDomains.every(d => fact.domain.includes(d))) continue;
      if (wantEntities.length && !wantEntities.every(e => fact.entities.includes(e))) continue;

      const score = terms.length ? scoreFact(fact, terms) : 1;
      if (terms.length && score === 0) continue;
      results.push({
        path: p, title: fact.title, body: fact.body, score,
        kind: fact.kind, type: fact.type, domain: fact.domain, entities: fact.entities,
      });
    }
    results.sort((x, y) => y.score - x.score || x.path.localeCompare(y.path));
    return { results: results.slice(0, 50) };
  },

  explain: async (
    _repo: string, _branch: string, path: string, commit?: string,
    opts?: { fallback?: 'before' },
  ): Promise<{ incoming: RefGroup[]; outgoing: RefGroup[] }> => {
    const { b, ix } = state();
    let anchorSha = commit ?? b.head;
    let sha = treeAt(b, anchorSha)[path];
    // Mirrors `fact`'s ?fallback=before: a commit-anchored explain past a
    // retraction has no tree entry at `commit` (RightPanel.tsx:483 passes this
    // whenever the anchor isn't live), so walk back to the last commit where
    // the path still existed and read ITS refs — matching what the fact panel
    // itself falls back to, so the rail and the body never disagree. That
    // walked-back commit becomes the EFFECTIVE anchor for everything below —
    // the fact's own outgoing refs, and every neighbor's title/versions/
    // deleted state — so the rail is internally consistent with what the
    // fact panel itself is showing.
    if (!sha && commit && opts?.fallback === 'before') {
      const from = b.commits.findIndex(c => c.sha === commit);
      if (from !== -1) {
        for (const c of b.commits.slice(from)) {
          const s = treeAt(b, c.sha)[path];
          if (s) { sha = s; anchorSha = c.sha; break; }
        }
      }
    }
    // Bogus/unresolvable anchors behave like HEAD (index 0 — no filtering),
    // rather than throwing: explain has never rejected an unrecognised commit.
    const anchorIdx = Math.max(commitIndex(b, anchorSha), 0);
    const fact = sha ? b.blobs[sha] : undefined;

    const outgoingPaths = dedupePaths((fact?.refs ?? []).filter(r => r.startsWith('kb/')));
    const outgoing = outgoingPaths.map(p => refGroup(b, p, anchorIdx));

    // Incoming can't start from the HEAD-only `backlinks` map the way it used
    // to: a historical anchor needs sources whose refs later changed to drop
    // `path`, or that cited it before being retracted themselves, neither of
    // which HEAD's current refs would show. `allBacklinks` is the all-time
    // superset; `currentlyAsserts` re-resolves each candidate against THIS
    // anchor specifically (so a source whose ref was removed by the anchor
    // correctly drops out), and `assertingVersions` replaces the generic
    // "every commit that touched the source" version list with only the
    // revisions that actually asserted this particular edge.
    const incomingCandidates = [...(ix.allBacklinks.get(path) ?? [])]
      .filter(p => currentlyAsserts(b, p, path, anchorSha));
    const incoming = incomingCandidates.map(p => ({
      ...refGroup(b, p, anchorIdx),
      versions: assertingVersions(b, p, path, anchorIdx),
    }));

    return { incoming, outgoing };
  },

  recent: async (
    _repo: string, _branch: string, path: string, query = '', limit = 50, offset = 0,
    opts?: { typeFilter?: string; excludeType?: string; kinds?: string[]; excludeKinds?: string[];
             origins?: string[]; domains?: string[]; entities?: string[]; eps?: string[] },
  ): Promise<RecentResponse> => {
    const { b } = state();
    // Same eps decision as search: the bundle has no episode data, so an
    // eps-filtered query returns nothing rather than silently matching
    // everything. See report Finding 6.
    if (opts?.eps?.length) return { facts: [], total: 0 };
    const q = query.trim().toLowerCase();
    const all = scopedFacts(b, path)
      .filter(({ fact }) => !q || fact.title.toLowerCase().includes(q))
      .filter(({ fact }) => !opts?.typeFilter || fact.type === opts.typeFilter)
      .filter(({ fact }) => !opts?.excludeType || fact.type !== opts.excludeType)
      .filter(({ fact }) => !opts?.kinds?.length || opts.kinds.includes(fact.kind ?? ''))
      .filter(({ fact }) => !opts?.excludeKinds?.length || !opts.excludeKinds.includes(fact.kind ?? ''))
      .filter(({ fact }) => !opts?.origins?.length || opts.origins.includes(fact.origin ?? ''))
      .filter(({ fact }) => !opts?.domains?.length || opts.domains.every(d => fact.domain.includes(d)))
      .filter(({ fact }) => !opts?.entities?.length || opts.entities.every(e => fact.entities.includes(e)))
      .map(({ path, fact }) => ({
        path, title: fact.title, kind: fact.kind, type: fact.type,
        committed_at: lastTouched(b, path),
      }))
      .sort((x, y) => y.committed_at - x.committed_at || x.path.localeCompare(y.path));
    return { facts: all.slice(offset, offset + limit), total: all.length };
  },

  stats: async (_repo: string, _branch: string, path: string): Promise<Stats> => {
    const { b } = state();
    const facts = scopedFacts(b, path);
    const domains: Record<string, number> = {};
    const entities: Record<string, number> = {};
    let sum = 0;
    for (const { fact } of facts) {
      for (const d of fact.domain) domains[d] = (domains[d] ?? 0) + 1;
      for (const e of fact.entities) entities[e] = (entities[e] ?? 0) + 1;
      sum += fact.confidence;
    }
    return {
      total: facts.length, domains, entities,
      avg_confidence: facts.length ? sum / facts.length : 0,
    };
  },

  activity: async (_repo: string, _branch: string, path: string): Promise<ActivityStats> => {
    const { b } = state();
    const now = b.commits[0]?.ts ?? 0;
    const since = (days: number) =>
      b.commits.filter(c => now - c.ts <= days * 86400).length;
    return {
      // openapi.yaml types last_commit as date-time and RightPanel.tsx:627-628
      // feeds it straight into `new Date(...)`/`relativeTime(...)` — a bare
      // SHA parses to Invalid Date there. changes_7d/30d/90d intentionally
      // stay path-unscoped and anchored to the bundle's newest commit rather
      // than wall-clock "now" (deferred — logged, not fixed here).
      last_commit: new Date(commitTs(b, b.head) * 1000).toISOString(),
      total: commitsTouching(b, path),
      changes_7d: since(7), changes_30d: since(30), changes_90d: since(90),
    };
  },

  completions: async (
    _repo: string, _branch: string, category: string, prefix = '',
  ): Promise<{ values: string[] }> => {
    const { b } = state();
    if (category === 'path') {
      return { values: nextPathSegments(treeAt(b), prefix) };
    }
    const seen = new Set<string>();
    for (const { fact } of headFacts(b)) {
      const source =
        category === 'domain' ? fact.domain :
        category === 'entity' ? fact.entities :
        category === 'type'   ? (fact.type ? [fact.type] : []) :
        category === 'kind'   ? (fact.kind ? [fact.kind] : []) :
        category === 'origin' ? (fact.origin ? [fact.origin] : []) : [];
      for (const v of source) seen.add(v);
    }
    const p = prefix.toLowerCase();
    return { values: [...seen].filter(v => v.toLowerCase().startsWith(p)).sort() };
  },

  getAgentBranch: async (_repo: string): Promise<string> => state().b.ref,

  // Unreachable: the shell sets serverReadOnly, so isReadOnly() hides every
  // write control. These are a backstop, not a code path. Declared with a
  // rest parameter (rather than the brief's zero-arg draft) because the real
  // call sites pass their full argument lists regardless — e.g.
  // RightPanel.tsx:162 calls updateFact(repo, branch, path, raw) — and a
  // concrete zero-arg signature here would fail `npm run check` with
  // "Expected 0 arguments, but got 4" at every such call site.
  updateFact: readOnly<Fact>('updateFact'),
  retractFact: readOnly<void>('retractFact'),

  // Unreachable: /explore browses one repo and never enters a lens context.
  // Same rest-parameter fix as above — e.g. Library.tsx:440 calls
  // lensBrowse(lensName, path, ontologyRoot, repos), 4 arguments.
  listLensFacts: noLens<{ facts: LensFactEntry[]; total: number }>('listLensFacts'),
  lensSearch: noLens<(SearchResult & { source: LensSource })[]>('lensSearch'),
  getLensFact: noLens<Fact & { source: LensSource }>('getLensFact'),
  getLensStats: noLens<LensStats>('getLensStats'),
  lensBrowse: noLens<LensBrowseResponse>('lensBrowse'),
  lensCompletions: noLens<{ values: string[] }>('lensCompletions'),
};
