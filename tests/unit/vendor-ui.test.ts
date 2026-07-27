import { describe, it, expect } from 'vitest';
import { resolveImportGraph, renderApiBarrel, writeVendorSwap } from '../../scripts/lib/vendor-ui.mjs';

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

describe('writeVendorSwap', () => {
  /**
   * A minimal in-memory stand-in for node:fs/promises, keyed by full path
   * (no real disk I/O). `mkdir` is a no-op since the fake has no concept of
   * directories — only file entries. This lets the "old vendor survives a
   * write failure" guarantee be tested without touching a real filesystem.
   */
  function fakeFs(initial: Record<string, string> = {}) {
    const disk = new Map<string, string>(Object.entries(initial));
    const under = (dir: string, p: string) => p === dir || p.startsWith(`${dir}/`);
    return {
      disk,
      async mkdir() {},
      async writeFile(p: string, content: string) { disk.set(p, content); },
      async rm(dir: string) {
        for (const k of [...disk.keys()]) if (under(dir, k)) disk.delete(k);
      },
      async rename(from: string, to: string) {
        for (const k of [...disk.keys()]) {
          if (under(from, k)) {
            disk.set(to + k.slice(from.length), disk.get(k)!);
            disk.delete(k);
          }
        }
      },
    };
  }

  it('replaces outDir with the new entries when every write succeeds', async () => {
    const fs = fakeFs({ '/out/OldFile.tsx': 'stale' });
    await writeVendorSwap('/out', new Map([
      ['A.tsx', 'new A'],
      ['B.tsx', 'new B'],
    ]), fs);
    expect(Object.fromEntries(fs.disk)).toEqual({
      '/out/A.tsx': 'new A',
      '/out/B.tsx': 'new B',
    });
  });

  it('leaves a pre-existing outDir intact when the write phase fails partway through', async () => {
    // Reproduces the reviewer's finding: a transient failure mid-write must
    // not strand outDir with only some of the new files (and none of a
    // barrel written last) instead of either the complete old set or the
    // complete new one.
    const fs = fakeFs({ '/out/OldFile.tsx': 'stale-but-complete' });
    let writes = 0;
    const failingFs = {
      ...fs,
      async writeFile(p: string, content: string) {
        writes++;
        if (writes === 2) throw new Error('simulated disk failure');
        return fs.writeFile(p, content);
      },
    };
    const entries = new Map([
      ['A.tsx', 'new A'],
      ['B.tsx', 'new B'], // this write throws
      ['api.ts', 'new barrel'],
    ]);
    await expect(writeVendorSwap('/out', entries, failingFs))
      .rejects.toThrow('simulated disk failure');

    // The old vendor must be untouched — not partially overwritten, not gone.
    expect(Object.fromEntries(fs.disk)).toEqual({ '/out/OldFile.tsx': 'stale-but-complete' });
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
