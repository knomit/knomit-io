import type { Bundle, BundleFact } from './bundleTypes';
import { BUNDLE_SCHEMA_VERSION } from './bundleTypes';
import { buildIndex, type KbIndex } from './kbIndex';
import type { Fact, DirChild, BrowseResponse } from '../generated/kb-ui/upstreamApi';

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
  ): Promise<Fact> => {
    const { b } = state();
    const at = commit ?? b.head;
    const fact = readAt(b, path, at);
    if (!fact) throw new Error(`fact not found at ${at}: ${path}`);
    return fact;
  },
};
