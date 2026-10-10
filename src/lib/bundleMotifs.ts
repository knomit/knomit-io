import type { Bundle, BundleFact } from './bundleTypes';
import type {
  MotifCluster, MotifEntry, MotifHealth, MotifMatch, MotifsPage, MotifsQuery,
} from '../generated/kb-ui/upstreamApi';

/**
 * The motif vocabulary, derived from the bundle's HEAD tree.
 *
 * A port of the read-only subset of knomit's internal/store/motif_alias.go and
 * internal/web/handlers_motifs.go, in the posture knomit itself takes for a
 * corpus whose alias table has not been built ("every motif is its own
 * mechanical cluster"):
 *
 *   - cluster key = the sorted, stemmed token multiset of the spelling
 *     (store.groupingKey), so "atomic-write" and "write-atomic" share one;
 *   - canonical   = the highest-df member spelling, ties broken by name
 *     (store.electCanonical);
 *   - no judge merges, no written definitions: definition_state is "missing",
 *     aliases carry no method/rationale. A bundle holds frontmatter only; it
 *     has neither the alias table nor the definitions table.
 *
 * Stemming is the one approximation. knomit singularizes with go-pluralize;
 * `stem` below covers the regular English plurals, which is what motif
 * vocabulary is made of. A spelling pair it fails to unify stays two clusters
 * (understated recurrence), never a wrong merge.
 */

export function stem(t: string): string {
  if (t.length <= 3 || t.endsWith('ics')) return t;
  if (t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (/(sses|shes|ches|xes|zes)$/.test(t)) return t.slice(0, -2);
  if (/(ss|us|is)$/.test(t)) return t;
  if (t.endsWith('s')) return t.slice(0, -1);
  return t;
}

/** textnorm.Tokens(Canonicalize(s)): lowercase, split on hyphen/space/slash, stem, dedupe. */
export function motifTokens(s: string): string[] {
  const seen = new Set<string>();
  for (const f of s.toLowerCase().split(/[\s\-/]+/)) {
    if (f) seen.add(stem(f));
  }
  return [...seen];
}

/** store.groupingKey; falls back to the spelling when every token normalises away. */
export function clusterKeyOf(motif: string): string {
  return motifTokens(motif).sort().join('-') || motif;
}

interface Vocab {
  /** cluster_key -> cluster */
  clusters: Map<string, VCluster>;
  /** spelling -> cluster_key */
  keyOf: Map<string, string>;
  /** distinct spellings in the corpus */
  spellings: string[];
  health: MotifHealth;
}
interface VCluster {
  key: string; canonical: string; members: string[];
  /** distinct carrier paths, all of them (branch-wide) */
  paths: Set<string>;
}

const cache = new WeakMap<Bundle, Vocab>();

function headEntries(b: Bundle): Array<{ path: string; fact: BundleFact }> {
  const tree = b.trees[b.head] ?? {};
  const out: Array<{ path: string; fact: BundleFact }> = [];
  for (const path of Object.keys(tree)) {
    const fact = b.blobs[tree[path]];
    if (fact) out.push({ path, fact });
  }
  return out;
}

function vocab(b: Bundle): Vocab {
  const hit = cache.get(b);
  if (hit) return hit;

  const spellingPaths = new Map<string, Set<string>>();
  let authoredInstances = 0;
  const authoredPaths = new Map<string, Set<string>>();       // key -> paths
  const epistemicPaths = new Map<string, Set<string>>();
  const entries = headEntries(b);
  for (const { path, fact } of entries) {
    const own = [...new Set(fact.motifs ?? [])];
    for (const m of own) {
      if (!spellingPaths.has(m)) spellingPaths.set(m, new Set());
      spellingPaths.get(m)!.add(path);
    }
    if ((fact.origin ?? 'authored') === 'authored') {
      for (const m of own) {
        authoredInstances++;
        const k = clusterKeyOf(m);
        if (!authoredPaths.has(k)) authoredPaths.set(k, new Set());
        authoredPaths.get(k)!.add(path);
        if (fact.kind === 'epistemic') {
          if (!epistemicPaths.has(k)) epistemicPaths.set(k, new Set());
          epistemicPaths.get(k)!.add(path);
        }
      }
    }
  }

  const clusters = new Map<string, VCluster>();
  const keyOf = new Map<string, string>();
  for (const [m, paths] of spellingPaths) {
    const k = clusterKeyOf(m);
    keyOf.set(m, k);
    let c = clusters.get(k);
    if (!c) clusters.set(k, c = { key: k, canonical: m, members: [], paths: new Set() });
    c.members.push(m);
    for (const p of paths) c.paths.add(p);
  }
  for (const c of clusters.values()) {
    // electCanonical: highest df, ties lexicographic.
    c.members.sort((x, y) =>
      spellingPaths.get(y)!.size - spellingPaths.get(x)!.size || x.localeCompare(y));
    c.canonical = c.members.reduce((best, m) => {
      const d = spellingPaths.get(m)!.size, bd = spellingPaths.get(best)!.size;
      return d > bd || (d === bd && m < best) ? m : best;
    });
  }

  const nAuthored = authoredPaths.size;
  const recurring = [...authoredPaths.values()].filter(s => s.size >= 2).length;
  const links = Math.max(0, authoredInstances - nAuthored);
  const health: MotifHealth = {
    authored_clusters: nAuthored,
    authored_recurring: recurring,
    authored_mints: nAuthored,
    authored_links: links,
    authored_epistemic_recurring: [...epistemicPaths.values()].filter(s => s.size >= 2).length,
    recurrence_rate: nAuthored ? recurring / nAuthored : 0,
    mint_to_link_ratio: links ? nAuthored / links : nAuthored,
  };
  const v = { clusters, keyOf, spellings: [...spellingPaths.keys()], health };
  cache.set(b, v);
  return v;
}

function entryFor(c: VCluster, scoped: number): MotifEntry {
  return {
    cluster_key: c.key, canonical: c.canonical, members: c.members,
    df: scoped, df_total: c.paths.size, definition_state: 'missing',
  };
}

/** GET .../motifs — df-desc (or name) vocabulary page, `path` scoping the df counts only. */
export function motifsPage(b: Bundle, opts: MotifsQuery = {}): MotifsPage {
  const v = vocab(b);
  const prefix = opts.path ?? '';
  const q = (opts.q ?? '').trim().toLowerCase();
  let rows: MotifEntry[] = [];
  for (const c of v.clusters.values()) {
    let scoped = c.paths.size;
    if (prefix) scoped = [...c.paths].filter(p => p.startsWith(prefix)).length;
    if (scoped === 0) continue;
    if (q && !c.members.some(m => m.toLowerCase().includes(q))) continue;
    rows.push(entryFor(c, scoped));
  }
  rows = opts.sort === 'name'
    ? rows.sort((x, y) => x.canonical.localeCompare(y.canonical))
    : rows.sort((x, y) => y.df - x.df || x.canonical.localeCompare(y.canonical));
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(opts.limit ?? 50, 200);
  // `path` narrows the health block too (it is scope, not a filter); `q` does not.
  const health = prefix ? scopedHealth(b, prefix) : v.health;
  return { count: rows.length, health, motifs: rows.slice(offset, offset + limit) };
}

function scopedHealth(b: Bundle, prefix: string): MotifHealth {
  const sub: Bundle = {
    ...b,
    trees: { [b.head]: Object.fromEntries(
      Object.entries(b.trees[b.head] ?? {}).filter(([p]) => p.startsWith(prefix))) },
  };
  return vocab(sub).health;
}

/** Spellings (as stored on facts) that satisfy `term` at `tier`, cumulative like the server. */
function matchingSpellings(v: Vocab, terms: string[], tier: MotifMatch = 'exact'): Set<string> {
  const rank = { exact: 0, stem: 1, 'token-2': 2 }[tier] ?? 0;
  const out = new Set<string>();
  for (const term of terms) {
    const key = v.keyOf.get(term) ?? clusterKeyOf(term);
    for (const m of v.spellings) {
      // With no alias table, exact and stem are the same question: one cluster key.
      if (v.keyOf.get(m) === key) out.add(m);
    }
    if (rank >= 2) {
      const want = new Set(motifTokens(term));
      if (want.size >= 2) {
        for (const m of v.spellings) {
          if (motifTokens(m).filter(t => want.has(t)).length >= 2) out.add(m);
        }
      }
    }
  }
  return out;
}

/** The motif filter on search/recent: does this fact carry any matching spelling? */
export function motifFilter(
  b: Bundle, motifs: string[] | undefined, tier?: MotifMatch,
): ((fact: BundleFact) => boolean) | null {
  if (!motifs?.length) return null;
  const set = matchingSpellings(vocab(b), motifs, tier);
  return fact => (fact.motifs ?? []).some(m => set.has(m));
}

/** GET .../motifs/{key} — `key` is a cluster_key or any member spelling. null = 404. */
export function motifClusterDetail(
  b: Bundle, key: string, recency: (path: string) => number, titleOf: (path: string) => { title: string; type?: string },
): MotifCluster | null {
  const v = vocab(b);
  const c = v.clusters.get(key) ?? v.clusters.get(v.keyOf.get(key) ?? clusterKeyOf(key));
  if (!c) return null;
  const carriers = [...c.paths]
    .map(path => ({ path, committed_at: recency(path), ...titleOf(path) }))
    .sort((x, y) => y.committed_at - x.committed_at || x.path.localeCompare(y.path));
  return {
    ...entryFor(c, c.paths.size),
    carrier_count: carriers.length,
    carriers: carriers.slice(0, 20),
    aliases: c.members.map(motif => ({ motif, method: '' })),
  };
}
