import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The latest stable release, as written by scripts/sync.mjs at build time.
 *
 * Read with fs rather than imported, deliberately: src/generated/release.json
 * is gitignored and absent on a checkout that has not run the sync, and a bare
 * `import` of a missing JSON file is a build-time module-resolution error, not
 * a value this module could fall back from. Reading it lets /download degrade
 * to "see the releases page" instead of failing the build — the same
 * don't-break-the-build posture sync.mjs takes for every other artifact.
 *
 * Build-time only. This module must never be imported into a client island.
 */

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface Release {
  tag: string;
  /** Asset-name version: the tag without its leading "v". */
  version: string;
  url: string;
  published: string;
  assets: ReleaseAsset[];
}

export type PlatformId = 'macos' | 'linux';

export interface Platform {
  id: PlatformId;
  name: string;
  arch: string;
  /** The tray app. Absent if this release shipped no desktop build for it. */
  desktop?: ReleaseAsset;
  /** The `knomit serve` tarball. */
  server?: ReleaseAsset;
}

const GENERATED = path.resolve(process.cwd(), 'src/generated/release.json');

function load(): Release | null {
  try {
    const parsed = JSON.parse(readFileSync(GENERATED, 'utf8')) as Release;
    return parsed.tag && parsed.assets?.length ? parsed : null;
  } catch {
    return null;
  }
}

export const release: Release | null = load();

/**
 * Group a release's assets by platform.
 *
 * Matched on the asset NAME's os-arch segment rather than on a hardcoded
 * filename, so a version bump needs no change here. Desktop and server are
 * told apart by extension: `.app.zip`/`.AppImage` are the tray app, `.tar.gz`
 * is the server. `.ed25519` sidecars never reach this — sync.mjs drops them,
 * since they are a verification detail rather than a download.
 *
 * A platform with neither asset is omitted entirely: rendering an empty card
 * would advertise a build this release does not contain.
 */
export function platforms(r: Release | null): Platform[] {
  if (!r) return [];
  const spec: Array<Omit<Platform, 'desktop' | 'server'> & { match: RegExp }> = [
    { id: 'macos', name: 'macOS', arch: 'Apple Silicon', match: /darwin-arm64/i },
    { id: 'linux', name: 'Linux', arch: 'x86_64', match: /linux-amd64/i },
  ];
  return spec
    .map(({ match, ...p }) => {
      const mine = r.assets.filter(a => match.test(a.name));
      return {
        ...p,
        desktop: mine.find(a => /\.app\.zip$|\.AppImage$/i.test(a.name)),
        server: mine.find(a => /\.tar\.gz$/i.test(a.name)),
      };
    })
    .filter(p => p.desktop || p.server);
}

/** Bytes as the rounded MB a download dialog would show. */
export function mb(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}
