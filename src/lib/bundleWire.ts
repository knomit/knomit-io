import type { Bundle, WireBundle } from './bundleTypes';

/** Expand a wire bundle's `treeDeltas` into full per-commit `trees`. */
export function decodeBundle(w: WireBundle): Bundle {
  const { treeDeltas, ...rest } = w;
  const trees: Bundle['trees'] = {};
  let tree: Record<string, string> = {};
  for (let i = w.commits.length - 1; i >= 0; i--) {
    tree = { ...tree };
    for (const [path, blob] of Object.entries(treeDeltas[i] ?? {})) {
      if (blob === null) delete tree[path];
      else tree[path] = blob;
    }
    trees[w.commits[i].sha] = tree;
  }
  return { ...rest, trees };
}
