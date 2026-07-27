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
}
