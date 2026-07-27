import type { Bundle } from './bundleTypes';

export interface KbIndex {
  /** target fact path -> paths of facts that ref it. External URLs excluded. */
  backlinks: Map<string, string[]>;
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

  return { backlinks, postings, headPaths };
}
