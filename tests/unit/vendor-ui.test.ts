import { describe, it, expect } from 'vitest';
import { resolveImportGraph, renderApiBarrel } from '../../scripts/lib/vendor-ui.mjs';

/** In-memory reader: path -> source. Returns null for a miss (404 / ENOENT). */
function reader(files: Record<string, string>) {
  return async (p: string) => (p in files ? files[p] : null);
}

describe('resolveImportGraph', () => {
  it('follows relative imports transitively and resolves .ts / .tsx', async () => {
    const read = reader({
      'Library.tsx': `import { api } from './api';\nimport { Row } from './ui';`,
      'api.ts': `import type { X } from './state';`,
      'state.ts': `export const init = {};`,
      'ui.tsx': `export const Row = () => null;`,
    });
    const { files } = await resolveImportGraph(read, ['Library.tsx']);
    expect(files.sort()).toEqual(['Library.tsx', 'api.ts', 'state.ts', 'ui.tsx']);
  });

  it('collects bare specifiers as npm dependencies, deduped', async () => {
    const read = reader({
      'A.tsx': `import React from 'react';\nimport ReactMarkdown from 'react-markdown';\nimport './B';`,
      'B.tsx': `import remarkGfm from 'remark-gfm';\nimport React from 'react';`,
    });
    const { bareDeps } = await resolveImportGraph(read, ['A.tsx']);
    expect(bareDeps.sort()).toEqual(['react', 'react-markdown', 'remark-gfm']);
  });

  it('follows CSS imports and does not treat them as npm deps', async () => {
    const read = reader({
      'A.tsx': `import './a.css';`,
      'a.css': `.k-prose { color: red; }`,
    });
    const { files, bareDeps } = await resolveImportGraph(read, ['A.tsx']);
    expect(files.sort()).toEqual(['A.tsx', 'a.css']);
    expect(bareDeps).toEqual([]);
  });

  it('throws naming the importer when a relative import cannot be resolved', async () => {
    const read = reader({ 'A.tsx': `import './missing';` });
    await expect(resolveImportGraph(read, ['A.tsx']))
      .rejects.toThrow(/A\.tsx.*\.\/missing/);
  });

  it('does not mistake a later, unrelated "from" identifier for an import clause', async () => {
    // Mirrors upstream's api.ts: a top-level `export const` whose body, many
    // lines later, uses `from` as a plain identifier/string (a query param
    // name) rather than an import specifier. A naive "scan ahead to the next
    // quote" regex misreads `p.set('from', from)` as if `'from` opened a
    // module path, and swallows everything up to the next stray quote.
    const read = reader({
      'A.tsx': [
        `import React from 'react';`,
        `export const api = {`,
        `  factCommits: (from?: string, before?: string) => {`,
        `    const p = new URLSearchParams({ limit: '50' });`,
        `    if (from) p.set('from', from);`,
        `    if (before) p.set('before', before);`,
        `  },`,
        `};`,
      ].join('\n'),
    });
    const { files, bareDeps } = await resolveImportGraph(read, ['A.tsx']);
    expect(files).toEqual(['A.tsx']);
    expect(bareDeps).toEqual(['react']);
  });

  it('does not false-positive on a semicolon-free stray "from" string literal', async () => {
    // The earlier `[^;]*?`-bounded fix only worked by accident: it happened
    // to hit a semicolon before reaching upstream's `p.set('from', from)`.
    // Nothing stops the same shape from occurring with no semicolon in
    // between at all — e.g. a plain object literal whose value happens to
    // be the string 'from'. This must not be read as an import.
    const read = reader({
      'A.tsx': `export const cfg = {\n  tag: 'from'\n}`,
    });
    const { files, bareDeps } = await resolveImportGraph(read, ['A.tsx']);
    expect(files).toEqual(['A.tsx']);
    expect(bareDeps).toEqual([]);
  });

  it('still resolves a real import that follows a semicolon-free stray "from" string', async () => {
    // The dangerous failure mode: the bogus `'from` match consumes
    // characters up to the NEXT quote in the file, which can be the opening
    // quote of a genuine, later import — silently dropping it from the
    // graph instead of erroring.
    const read = reader({
      'A.tsx': `export const cfg = {\n  tag: 'from'\n}\nimport Sibling from './Sibling'`,
      'Sibling.tsx': `export const Sibling = () => null;`,
    });
    const { files } = await resolveImportGraph(read, ['A.tsx']);
    expect(files.sort()).toEqual(['A.tsx', 'Sibling.tsx']);
  });

  it('ignores a "from" clause hidden inside a comment', async () => {
    const read = reader({
      'A.tsx': `// ported from './legacy'\nimport React from 'react';`,
    });
    const { files, bareDeps } = await resolveImportGraph(read, ['A.tsx']);
    expect(files).toEqual(['A.tsx']);
    expect(bareDeps).toEqual(['react']);
  });

  it('ignores a "from" clause hidden inside a template literal', async () => {
    const read = reader({
      'A.tsx': "export const msg = `ported from './legacy'`;\nimport React from 'react';",
    });
    const { files, bareDeps } = await resolveImportGraph(read, ['A.tsx']);
    expect(files).toEqual(['A.tsx']);
    expect(bareDeps).toEqual(['react']);
  });
});

describe('renderApiBarrel', () => {
  it('re-exports upstream types and shadows the api object', () => {
    const out = renderApiBarrel();
    expect(out).toContain(`export * from './upstreamApi'`);
    expect(out).toContain(`export { api } from '../../lib/bundleApi'`);
    // The explicit export must come after the star so intent is obvious on read.
    expect(out.indexOf(`export * from`)).toBeLessThan(out.indexOf(`export { api }`));
  });
});
