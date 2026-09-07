// The navigation stack.
//
// docs/NAVIGATION-CONTRACT.md calls this the most valuable behaviour in the
// prototype and the thing most likely to be destroyed in a rewrite. The
// canonical acceptance test it must pass:
//
//   League -> Grades -> filter to CB -> scroll -> open a player -> back
//
// must return to the leaderboard with the filter still applied, the same sort
// order, and the same scroll offset.

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import {
  NavigationContext, NavigationStateContext,
  type NavigationState, type Navigator,
} from './navigation';
import {
  makeFrame, parseUrl, topOf, urlFor, withTop, type Frame,
} from './navigationStack';

interface Props {
  readonly children: ReactNode;
  /** Screen shown when nothing else is indicated. */
  readonly initialScreen: string;
  /**
   * Maps a screen to the root it belongs under, returning the screen itself
   * when it is already a root.
   *
   * Passed in rather than imported so navigation stays independent of the
   * screen registry. Getting this wrong is subtle: assuming a single root
   * stacks a cold link to /league on top of Team, and the back affordance then
   * appears on a tab that should not have one.
   */
  readonly rootOf?: (screen: string) => string;
}

function initialStack(initialScreen: string, rootOf: (screen: string) => string): Frame[] {
  const parsed = typeof window === 'undefined' ? null : parseUrl(window.location.pathname);
  if (parsed === null) return [makeFrame(initialScreen)];

  const root = rootOf(parsed.screen);
  if (root === parsed.screen) return [makeFrame(parsed.screen, parsed.params)];
  // A cold URL naming something deeper opens on top of its root, so the back
  // affordance leads somewhere rather than off the end of the stack.
  return [makeFrame(root), makeFrame(parsed.screen, parsed.params)];
}

export function NavigationProvider({ children, initialScreen, rootOf }: Props) {
  const resolveRoot = rootOf ?? ((screen: string) => screen);
  const [stack, setStack] = useState<Frame[]>(() => initialStack(initialScreen, resolveRoot));
  /** Set when the next render is a return, so scroll should be restored. */
  const restoreTo = useRef<number | null>(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const captureScroll = useCallback((frames: readonly Frame[]): Frame[] => {
    const y = typeof window === 'undefined' ? 0 : window.scrollY;
    return withTop(frames, { scroll: y });
  }, []);

  const push = useCallback((screen: string, params: Record<string, string> = {}) => {
    setStack((current) => {
      const next = [...captureScroll(current), makeFrame(screen, params)];
      const top = topOf(next);
      if (top !== undefined && typeof window !== 'undefined') {
        window.history.pushState({ depth: next.length }, '', urlFor(top));
      }
      return next;
    });
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, [captureScroll]);

  /** Pops without touching history: used by the popstate handler, which has
   *  already been moved by the browser. */
  const popFrame = useCallback(() => {
    setStack((current) => {
      if (current.length <= 1) return current;
      const beneath = current[current.length - 2] as Frame;
      restoreTo.current = beneath.scroll;
      return current.slice(0, -1);
    });
  }, []);

  const back = useCallback(() => {
    // The browser is the single authority on going back: calling history.back()
    // and letting popstate do the popping means the hardware button, the edge
    // swipe and the in-app affordance all take one path. Two paths would
    // desynchronise the moment someone pressed both quickly.
    if (typeof window !== 'undefined' && stackRef.current.length > 1) {
      window.history.back();
      return;
    }
    popFrame();
  }, [popFrame]);

  const replaceRoot = useCallback((screen: string, params: Record<string, string> = {}) => {
    // The bottom nav uses this, not push. Tapping Team from four levels deep
    // inside League must not grow the stack forever.
    setStack(() => {
      const next = [makeFrame(screen, params)];
      const top = topOf(next);
      if (top !== undefined && typeof window !== 'undefined') {
        window.history.replaceState({ depth: 1 }, '', urlFor(top));
      }
      return next;
    });
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPop = () => popFrame();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [popFrame]);

  // Scroll is restored after the returning screen has rendered, and clamped: if
  // the content is now shorter, landing in blank space is worse than landing at
  // the bottom of it.
  useLayoutEffect(() => {
    const target = restoreTo.current;
    if (target === null || typeof window === 'undefined') return;
    restoreTo.current = null;
    const apply = () => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(target, max));
    };
    apply();
    const frame = window.requestAnimationFrame(apply);
    return () => window.cancelAnimationFrame(frame);
  }, [stack]);

  const navigator = useMemo<Navigator>(() => ({
    push,
    back,
    replaceRoot,
    depth: () => stackRef.current.length,
    current: () => topOf(stackRef.current)?.screen ?? '',
    readUi: <T,>(key: string, initial: T): T => {
      const top = topOf(stackRef.current);
      const held = top?.ui[key];
      return held === undefined ? initial : (held as T);
    },
    writeUi: <T,>(key: string, value: T): void => {
      setStack((current) => {
        const top = topOf(current);
        if (top === undefined || top.ui[key] === value) return current;
        return withTop(current, { ui: { ...top.ui, [key]: value } });
      });
    },
  }), [push, back, replaceRoot]);

  const top = topOf(stack);
  const state = useMemo<NavigationState>(() => ({
    screen: top?.screen ?? '',
    params: top?.params ?? {},
    depth: stack.length,
    ui: top?.ui ?? {},
  }), [top, stack.length]);

  return (
    <NavigationContext.Provider value={navigator}>
      <NavigationStateContext.Provider value={state}>
        {children}
      </NavigationStateContext.Provider>
    </NavigationContext.Provider>
  );
}
