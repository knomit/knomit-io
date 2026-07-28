/** Bump when the shape below changes; the loader validates it. */
export const BUNDLE_SCHEMA_VERSION = 1;

/** One parsed fact version. Mirrors the `Fact` shape the vendored UI expects. */
export interface BundleFact {
  title: string;
  body: string;
  type?: string;
  kind?: string;
  origin?: string;
  domain: string[];
  entities: string[];
  refs: string[];
  confidence: number;
  sources: number;
  parse_error?: string;
}

export interface BundleCommit {
  sha: string;
  ts: number;      // unix seconds
  author: string;
  subject: string;
}

/**
 * The guided tour's spine, resolved at build time rather than hardcoded.
 *
 * The tour walks one narrative: open a synthesis fact, follow an outgoing ref
 * to a fact it was distilled from, time-travel that fact, then come back via
 * the incoming ref. That needs a specific shape in the data — a synthesis
 * whose target has more than one version — and the KB rebuilds every three
 * hours, so a hardcoded pair would rot within days.
 *
 * Absent when no pair qualifies. The tour affordance then doesn't render at
 * all, which is the intended degradation: no tour beats a broken one.
 */
export interface BundleTour {
  /** A synthesis fact with entities to filter by and a qualifying out-ref. */
  synthesis: string;
  /** A fact the synthesis cites, with >1 version so time-travel has something to show. */
  target: string;
  /** The target's commits, oldest-first — the tour scrubs to the first. */
  targetVersions: string[];
  /** An entity on the synthesis, for the click-to-filter step. */
  entity: string;
}

export interface Bundle {
  schemaVersion: number;
  repo: string;
  ref: string;
  head: string;
  /** Newest-first. */
  commits: BundleCommit[];
  /** commitSha -> { factPath -> blobSha } */
  trees: Record<string, Record<string, string>>;
  /** blobSha -> parsed fact */
  blobs: Record<string, BundleFact>;
  /** Guided-tour spine; absent when the corpus has no qualifying pair. */
  tour?: BundleTour;
}
