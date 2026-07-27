import type { Bundle } from './bundleTypes';

export interface KbIndex {
  /** target fact path -> paths of facts that ref it AT HEAD. External URLs
   *  excluded. The fast path for live browsing — cost is O(HEAD facts). */
  backlinks: Map<string, string[]>;
  /** target fact path -> paths of facts that EVER referenced it, across
   *  every commit in the bundle, not just HEAD. Anchor-aware `explain`
   *  (bundleApi.ts) starts from this superset when a historical commit is
   *  requested, then re-resolves each candidate's actual asserting commits
   *  against that anchor separately — a source whose refs later changed to
   *  drop `path`, or that referenced it before being retracted itself, must
   *  still surface when scrubbing to an older commit, even though neither
   *  is in `backlinks` (which only reflects HEAD's current refs). Built by
   *  a second, separate pass over every commit's tree so the HEAD-only
   *  `backlinks` path above stays exactly as cheap as before. */
  allBacklinks: Map<string, Set<string>>;
  /** lowercased token -> fact paths containing it (HEAD only). */
  postings: Map<string, Set<string>>;
  /** every fact path present at HEAD. */
  headPaths: string[];
}

const TOKEN_RE = /[a-z0-9][a-z0-9'-]*/g;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

export function buildIndex(bundle: Bundle): KbIndex {
  const head = bundle.trees[bundle.head] ?? {};
  const headPaths = Object.keys(head);

  const backlinks = new Map<string, string[]>();
  const postings = new Map<string, Set<string>>();

  for (const path of headPaths) {
    const fact = bundle.blobs[head[path]];
    if (!fact) continue;

    // Only kb/ refs are fact-to-fact edges; the rest are external citations.
    for (const ref of fact.refs) {
      if (!ref.startsWith('kb/')) continue;
      const list = backlinks.get(ref);
      if (list) list.push(path); else backlinks.set(ref, [path]);
    }

    for (const token of tokenize(`${fact.title} ${fact.body}`)) {
      const set = postings.get(token);
      if (set) set.add(path); else postings.set(token, new Set([path]));
    }
  }

  // All-time backlinks: every commit's tree, not just HEAD's. Deliberately a
  // separate loop from the HEAD-only one above rather than folded into it, so
  // the common (live) path's cost is unaffected by history size.
  const allBacklinks = new Map<string, Set<string>>();
  for (const commit of bundle.commits) {
    const tree = bundle.trees[commit.sha] ?? {};
    for (const path of Object.keys(tree)) {
      const fact = bundle.blobs[tree[path]];
      if (!fact) continue;
      for (const ref of fact.refs) {
        if (!ref.startsWith('kb/')) continue;
        const set = allBacklinks.get(ref);
        if (set) set.add(path); else allBacklinks.set(ref, new Set([path]));
      }
    }
  }

  return { backlinks, allBacklinks, postings, headPaths };
}
