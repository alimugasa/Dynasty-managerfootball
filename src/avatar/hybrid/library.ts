// The asset library, loaded once.
//
// Five states, and they are five rather than two because the differences
// matter to whoever is filling the directory. "No manifest" is a deployment
// that forgot the library; "invalid" is a delivery with a fault in it, and it
// carries the fault list; "empty" is a valid manifest with no anatomy in it,
// which is this repository's actual state and is not an error. Collapsing them
// into a boolean would be exactly the invented answer rule 3 forbids.

import { parseManifest, isEmptyLibrary, type AssetManifest } from './manifest';
import { ASSET_ROOT } from './plan';

export type LibraryState =
  | { readonly status: 'loading' }
  | { readonly status: 'absent'; readonly url: string }
  | { readonly status: 'invalid'; readonly problems: readonly string[] }
  | { readonly status: 'empty'; readonly manifest: AssetManifest }
  | { readonly status: 'ready'; readonly manifest: AssetManifest };

export const MANIFEST_URL = `${ASSET_ROOT}manifest.json`;

let pending: Promise<LibraryState> | null = null;
let settled: LibraryState = { status: 'loading' };

/** The last known state, synchronously. `loading` until the fetch lands, which
 *  is why the renderer returns null on a first paint rather than blocking. */
export const librarySnapshot = (): LibraryState => settled;

const listeners = new Set<() => void>();

export function subscribeLibrary(fn: () => void): () => void {
  listeners.add(fn);
  void loadLibrary();
  return () => { listeners.delete(fn); };
}

/** Loaded once per page, cached forever: the manifest is static art metadata,
 *  and refetching it on every roster screen would cost more than the portraits
 *  it indexes. */
export function loadLibrary(): Promise<LibraryState> {
  pending ??= fetchOnce().then((state) => {
    settled = state;
    for (const fn of listeners) fn();
    return state;
  });
  return pending;
}

/** Test seam. Resets the memo so a suite can load a different library. */
export function resetLibrary(): void {
  pending = null;
  settled = { status: 'loading' };
}

/** Test seam. Installs a manifest without touching the network. */
export function useLibraryForTest(raw: unknown): LibraryState {
  const state = classify(raw);
  pending = Promise.resolve(state);
  settled = state;
  return state;
}

function classify(raw: unknown): LibraryState {
  const parsed = parseManifest(raw);
  if (!parsed.ok) return { status: 'invalid', problems: parsed.problems };
  if (isEmptyLibrary(parsed.manifest)) return { status: 'empty', manifest: parsed.manifest };
  return { status: 'ready', manifest: parsed.manifest };
}

async function fetchOnce(): Promise<LibraryState> {
  if (typeof fetch !== 'function') return { status: 'absent', url: MANIFEST_URL };
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'force-cache' });
    if (!res.ok) return { status: 'absent', url: MANIFEST_URL };
    return classify(await res.json());
  } catch {
    // A network failure and a missing file are the same fact to a caller that
    // can only draw or not draw. The URL goes in the state so the dev surface
    // can say which one it looked for.
    return { status: 'absent', url: MANIFEST_URL };
  }
}
