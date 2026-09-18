// The library, as a React subscription.
//
// Kept out of hybridRenderer.tsx so a screen can read the library's state
// without importing a renderer it is not going to use.

import { useSyncExternalStore } from 'react';
import { librarySnapshot, subscribeLibrary, type LibraryState } from './library';

export function useHybridLibrary(): LibraryState {
  return useSyncExternalStore(subscribeLibrary, librarySnapshot, librarySnapshot);
}
