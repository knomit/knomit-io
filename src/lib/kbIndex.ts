import type { Bundle } from './bundleTypes';

export interface KbIndex {
  /** target fact path -> paths of facts that EVER referenced it, across
   *  every commit in the bundle, not just HEAD. External URLs excluded.
   *  `explain` (bundleApi.ts) uses this as the incoming-edge candidate
   *  superset for every anchor, including HEAD — incoming edges are NOT
   *  time-bounded (search_graph_query.go's IncomingAtCommit applies no
   *  committed_at bound on the source, deliberately: referrers are, by
   *  nature, written AFTER the version of the target they point at), so
   *  there is no cheaper HEAD-only variant of this to fall back to; every
   *  `explain` call, anchored or not, scans the same superset. Measured
   *  cost: +4% index build time versus a HEAD-only equivalent, negligible
   *  for these bundle sizes. */
  allBacklinks: Map<string, Set<string>>;
}

const TOKEN_RE = /[a-z0-9][a-z0-9'-]*/g;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

export function buildIndex(bundle: Bundle): KbIndex {
  // allBacklinks scans every commit's tree, not just HEAD's, since `explain`
  // needs it for every anchor including HEAD (see the field's own docstring).
  const allBacklinks = new Map<string, Set<string>>();
  for (const commit of bundle.commits) {
    const tree = bundle.trees[commit.sha] ?? {};
    for (const path of Object.keys(tree)) {
      const fact = bundle.blobs[tree[path]];
      if (!fact) continue;
      // Only kb/ refs are fact-to-fact edges; the rest are external citations.
      for (const ref of fact.refs) {
        if (!ref.startsWith('kb/')) continue;
        const set = allBacklinks.get(ref);
        if (set) set.add(path); else allBacklinks.set(ref, new Set([path]));
      }
    }
  }

  return { allBacklinks };
}
