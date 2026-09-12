// Stack mechanics, kept free of React so they can be reasoned about and tested
// as plain data.

export interface Frame {
  /** Identity for React keys and for telling two frames of the same screen
   *  apart. Two frames of one screen keep their UI state independently. */
  readonly id: number;
  readonly screen: string;
  readonly params: Readonly<Record<string, string>>;
  /** Filter chips, sort order, active tab -- whatever the screen registered. */
  readonly ui: Readonly<Record<string, unknown>>;
  /** Captured at the moment of navigation, not continuously: a scroll listener
   *  firing on every frame of a long roster is a performance problem. */
  readonly scroll: number;
}

let nextId = 1;
export function makeFrame(
  screen: string, params: Record<string, string> = {},
): Frame {
  nextId += 1;
  return { id: nextId, screen, params, ui: {}, scroll: 0 };
}

/** Replaces the top frame, which is how UI state and scroll are recorded. */
export function withTop(stack: readonly Frame[], patch: Partial<Frame>): Frame[] {
  if (stack.length === 0) return [...stack];
  const top = stack[stack.length - 1] as Frame;
  return [...stack.slice(0, -1), { ...top, ...patch }];
}

export function topOf(stack: readonly Frame[]): Frame | undefined {
  return stack[stack.length - 1];
}

/** URL is a projection of the stack, never the source of truth: the stack holds
 *  UI state that has no business in a URL. Filters and sort order stay out. */
export function urlFor(frame: Frame): string {
  const id = frame.params['id'];
  return id === undefined ? `/${frame.screen}` : `/${frame.screen}/${encodeURIComponent(id)}`;
}

export interface UrlStack {
  readonly screen: string;
  readonly params: Record<string, string>;
}

/**
 * Reads a cold URL into a screen and params.
 *
 * A URL naming an entity is opened on top of a sensible root rather than as a
 * lone frame, so back() has somewhere to go instead of a blank screen.
 */
export function parseUrl(pathname: string): UrlStack | null {
  const parts = pathname.split('/').filter((p) => p.length > 0);
  const screen = parts[0];
  if (screen === undefined) return null;
  const id = parts[1];
  return { screen, params: id === undefined ? {} : { id: decodeURIComponent(id) } };
}
