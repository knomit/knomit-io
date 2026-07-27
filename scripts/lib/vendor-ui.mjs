/**
 * Resolve the knomit web UI source set by walking its import graph.
 *
 * The set is REF-DEPENDENT: at master it is 24 files importing only react,
 * react-dom and react-markdown; at dev, FactBody additionally pulls ./markdown
 * (markdown.tsx + markdown.css + remark-gfm). A hardcoded manifest would break
 * silently whenever KNOMIT_REF moves, so we discover it instead.
 */

/** Seed components: the four /explore surfaces plus the shell's time-travel hook. */
export const SEEDS = [
  'LeftPanel.tsx', 'RightPanel.tsx', 'EdgesRail.tsx', 'FilterBar.tsx',
  'TrailBreadcrumb.tsx', 'ErrorBoundary.tsx', 'useTimeTravel.ts',
  'useNavigationManager.ts',
];

const CANDIDATE_SUFFIXES = ['', '.tsx', '.ts', '.css'];

// Matches `import ... from '<path>'` / `export ... from '<path>'` (including
// `export * from`, `export type { X } from`, multi-line named-import lists).
// The keyword must sit at a statement boundary (start of source, or after
// whitespace / `;` / `}`) so it can't fire mid-identifier. Critically, the
// span between the keyword and `from` excludes quote characters entirely
// (`[^'";]`) — a real import/export-from clause never contains one (its
// bindings are bare identifiers and braces), so a stray `from` that is
// actually string content (e.g. `p.set('from', from)`, a query-param name)
// can never be reached: the quote before it blocks the scan outright, and
// the match simply fails to fire there instead of swallowing unrelated code.
// A bound like "no semicolon in between" is NOT equivalent — it only happens
// to work when semicolons occur before the stray `from`, and demonstrably
// breaks (both under- and over-matching) when they don't.
const FROM_IMPORT_RE = /(?:^|[\s;}])(?:import|export)\s(?:[^'";]*?\s)?from\s*['"]([^'"]+)['"]/g;

// Bare/side-effect imports (`import './a.css'`) have no `from` clause at all;
// matched separately so the pattern above can stay anchored to an actual
// `from` keyword instead of trying to make it optional (which would make the
// quote-exclusion bound above ineffective).
const BARE_IMPORT_RE = /(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g;

/**
 * Strip comments and template-literal contents before scanning for imports.
 *
 * Line/block comments are the common false-positive source (`// ported from
 * './legacy'`); template literals can never legally hold a real import
 * specifier (ES import syntax requires a plain string literal), so any
 * `from '...'`-shaped text inside one is inert and is blanked out too.
 * Ordinary single/double-quoted strings are kept verbatim — including their
 * quote characters — since those are exactly where a real import specifier
 * lives; we still track entry/exit of those strings so a "//" or "/*"
 * embedded in one (e.g. the URL literal 'http://x') is not mistaken for a
 * comment start.
 */
function stripNoise(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    if (c === '`') {
      i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') i++;
        i++;
      }
      i++; // skip closing backtick
      out += ' ';
      continue;
    }
    if (c === '"' || c === "'") {
      out += c;
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\' && i + 1 < n) { out += src[i] + src[i + 1]; i += 2; continue; }
        out += src[i];
        i++;
      }
      if (i < n) { out += src[i]; i++; } // closing quote
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * @param read  (path) => Promise<string|null> — null means "not found".
 * @param seeds entry filenames, relative to the UI source root.
 * @returns {Promise<{files: string[], bareDeps: string[]}>}
 */
export async function resolveImportGraph(read, seeds = SEEDS) {
  const sources = new Map();   // path -> source text
  const bare = new Set();
  const queue = [...seeds];

  while (queue.length) {
    const file = queue.pop();
    if (sources.has(file)) continue;

    const src = await read(file);
    if (src === null) throw new Error(`vendor-ui: could not read seed or import "${file}"`);
    sources.set(file, src);

    if (file.endsWith('.css')) continue;    // CSS has no JS imports we follow

    for (const spec of specifiers(src)) {
      if (!spec.startsWith('.')) {
        // Strip subpath (e.g. "react-dom/client" -> "react-dom") for the dep list.
        bare.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
        continue;
      }
      const base = spec.replace(/^\.\//, '');
      let resolved = null;
      for (const suffix of CANDIDATE_SUFFIXES) {
        const candidate = base + suffix;
        if (sources.has(candidate)) { resolved = candidate; break; }
        if (await read(candidate) !== null) { resolved = candidate; break; }
      }
      if (!resolved) throw new Error(`vendor-ui: ${file} imports "${spec}" which could not be resolved`);
      queue.push(resolved);
    }
  }

  return { files: [...sources.keys()], bareDeps: [...bare] };
}

function specifiers(rawSrc) {
  const src = stripNoise(rawSrc);
  const out = [];
  let m;
  FROM_IMPORT_RE.lastIndex = 0;
  while ((m = FROM_IMPORT_RE.exec(src)) !== null) out.push(m[1]);
  BARE_IMPORT_RE.lastIndex = 0;
  while ((m = BARE_IMPORT_RE.exec(src)) !== null) out.push(m[1]);
  return out.filter(Boolean);
}

/**
 * The generated api.ts barrel. ESM gives an explicit named export precedence
 * over `export *`, so `api` resolves to our bundle-backed implementation while
 * every type and pure helper falls through to upstream.
 */
export function renderApiBarrel() {
  return [
    `// GENERATED by scripts/sync.mjs — do not edit.`,
    `// Upstream's api.ts is vendored beside this file as upstreamApi.ts. We`,
    `// re-export its ~40 types and pure helpers, then shadow the one thing that`,
    `// talks HTTP: the \`api\` object. An explicit named export wins over the`,
    `// star re-export, so no vendored component needs changing.`,
    `export * from './upstreamApi';`,
    `export { api } from '../../lib/bundleApi';`,
    ``,
  ].join('\n');
}
