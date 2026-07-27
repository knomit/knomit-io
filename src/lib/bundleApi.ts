import type { Bundle, BundleFact } from './bundleTypes';
import { BUNDLE_SCHEMA_VERSION } from './bundleTypes';
import { buildIndex, type KbIndex } from './kbIndex';
import type {
  Fact, DirChild, BrowseResponse, HistoryResponse, CommitDetail, CommitFile,
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
};
