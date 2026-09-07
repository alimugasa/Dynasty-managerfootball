// Minimal navigation surface for Phase 1. The full stack — frames storing screen,
// params AND UI state (active tab, filter chips, sort order, scroll offset), with
// back() restoring all of it — is implemented in Phase 3 to the specification in
// docs/NAVIGATION-CONTRACT.md. This exists so EntityLink has something to call.

import { createContext, useContext } from 'react';

export interface Navigator {
  push(screen: string, params?: Record<string, string>): void;
  back(): void;
  replaceRoot(screen: string, params?: Record<string, string>): void;
  depth(): number;
}

const notImplemented = (op: string) => () => {
  throw new Error(
    `navigation.${op}() is not implemented until Phase 3 (Prompt 0045). ` +
      'See docs/NAVIGATION-CONTRACT.md.',
  );
};

export const NULL_NAVIGATOR: Navigator = {
  push: notImplemented('push'),
  back: notImplemented('back'),
  replaceRoot: notImplemented('replaceRoot'),
  depth: () => 0,
};

export const NavigationContext = createContext<Navigator>(NULL_NAVIGATOR);

export function useNavigator(): Navigator {
  return useContext(NavigationContext);
}
