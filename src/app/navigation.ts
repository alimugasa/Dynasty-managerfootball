// Navigation surface. The stack itself lives in NavigationProvider.tsx; this
// module is the contract screens and components code against.
//
// See docs/NAVIGATION-CONTRACT.md. A frame stores three things -- screen
// identity, params, and UI state including scroll offset -- and back() restores
// all three. Screens register their UI state through useUiState, so a screen
// cannot forget to preserve it.

import { createContext, useContext } from 'react';

/**
 * The reactive half of navigation.
 *
 * Kept separate from Navigator because the two change on different schedules:
 * the imperative methods are stable for the life of the provider, while this
 * changes on every push, pop and filter tap. A component reading only the
 * methods should not re-render when a chip is tapped three screens down, and a
 * component reading the state must re-render when it changes -- which a value
 * held in a ref would never do.
 */
export interface NavigationState {
  readonly screen: string;
  readonly params: Readonly<Record<string, string>>;
  readonly depth: number;
  /** UI state of the frame on top: filters, sort order, active tab. */
  readonly ui: Readonly<Record<string, unknown>>;
}

export const EMPTY_STATE: NavigationState = {
  screen: '', params: {}, depth: 0, ui: {},
};

export const NavigationStateContext = createContext<NavigationState>(EMPTY_STATE);

export function useNavigationState(): NavigationState {
  return useContext(NavigationStateContext);
}

export interface Navigator {
  push(screen: string, params?: Record<string, string>): void;
  back(): void;
  replaceRoot(screen: string, params?: Record<string, string>): void;
  depth(): number;
  /** Screen key of the frame on top of the stack. */
  current(): string;
  /** Reads UI state for the current frame, falling back to `initial`. */
  readUi<T>(key: string, initial: T): T;
  /** Writes UI state onto the current frame, so back() can restore it. */
  writeUi<T>(key: string, value: T): void;
}

const notImplemented = (op: string) => () => {
  throw new Error(
    `navigation.${op}() called outside a <NavigationProvider>. ` +
      'See docs/NAVIGATION-CONTRACT.md.',
  );
};

/** Used only outside a provider -- in isolated component tests, and in the
 *  component gallery, where navigating away would be meaningless. */
export const NULL_NAVIGATOR: Navigator = {
  push: notImplemented('push'),
  back: notImplemented('back'),
  replaceRoot: notImplemented('replaceRoot'),
  depth: () => 0,
  current: () => '',
  readUi: <T,>(_key: string, initial: T) => initial,
  writeUi: () => undefined,
};

export const NavigationContext = createContext<Navigator>(NULL_NAVIGATOR);

export function useNavigator(): Navigator {
  return useContext(NavigationContext);
}
