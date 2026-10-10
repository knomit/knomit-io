import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { api } from '../../src/lib/bundleApi';

const UI_DIR = path.resolve(__dirname, '../../src/generated/kb-ui');

/**
 * Upstream drift guard. If knomit adds an api method a vendored component
 * calls, this fails by name instead of surfacing as a runtime TypeError on a
 * page nobody exercised.
 */
describe('bundleApi covers every api.* call site in the vendored UI', () => {
  it('implements each referenced method', async () => {
    // upstreamApi.ts defines the interface rather than consuming it, and
    // api.ts is the shim that re-exports it — its own file-header comment
    // ("Upstream's api.ts is vendored beside this file as upstreamApi.ts")
    // contains the literal substring "api.ts", which the call-site regex
    // below can't tell apart from a real `api.<method>` access, so it must
    // be excluded too or the scan reports a phantom `ts` method.
    const files = (await readdir(UI_DIR))
      .filter(f => (f.endsWith('.ts') || f.endsWith('.tsx')) && f !== 'upstreamApi.ts' && f !== 'api.ts');
    expect(files.length).toBeGreaterThan(10);   // the vendor ran

    const called = new Set<string>();
    for (const f of files) {
      const raw = await readFile(path.join(UI_DIR, f), 'utf8');
      // Comments mention "api.ts" and "api.status" in prose; only code counts.
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
      for (const m of src.matchAll(/\bapi\.([a-zA-Z_$][\w$]*)/g)) called.add(m[1]);
    }
    expect(called.size).toBeGreaterThan(0);

    // Deliberately absent: vendored motifEndpoint.ts feature-detects these with
    // `typeof api.X === 'function'` and hides the control, so absence is the
    // contract, not drift. See the ABSENT block in bundleApi.ts.
    const ABSENT = new Set(['motifs', 'lensMotifs', 'motifCluster', 'lensMotifCluster']);
    const missing = [...called]
      .filter(name => !ABSENT.has(name))
      .filter(name => typeof (api as never)[name] !== 'function');
    for (const name of ABSENT) expect((api as never)[name], `${name} must stay absent`).toBeUndefined();
    expect(missing, `bundleApi is missing: ${missing.join(', ')}`).toEqual([]);
  });
});
