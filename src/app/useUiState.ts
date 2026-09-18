// UI state that survives a round trip.
//
// A screen registers its filters, sort order and active tab here rather than in
// local component state. That is the whole mechanism behind the navigation
// contract's promise that back() restores all three: state held in useState
// dies with the unmounted screen, state held on the frame does not.

import { useCallback } from 'react';
import { useNavigationState, useNavigator } from './navigation';

export function useUiState<T>(key: string, initial: T): [T, (value: T) => void] {
  const nav = useNavigator();
  // Read through the reactive context, write through the imperative one. Reading
  // from the navigator would take the value from a ref and never re-render.
  const { ui } = useNavigationState();
  const held = ui[key];
  const value = held === undefined ? initial : (held as T);
  const setValue = useCallback((next: T) => nav.writeUi(key, next), [nav, key]);
  return [value, setValue];
}
