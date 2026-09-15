// The component every screen uses.
//
// One entry point, so that "put a face here" is a single decision made once
// rather than thirteen screens each doing something slightly different. It
// owns four things the request asks for by name: the seed-keyed cache, lazy
// rendering for lists, the initials fallback so a broken face never reaches
// the screen, and the choice of which renderer draws.

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { PORTRAIT_PX, type PortraitSize } from './portrait';
import { svgPortraitRenderer } from './svgPortrait';
import { cachedProfile } from './cache';
import { COLOR, FONT } from '../app/tokens';

/**
 * The renderer in use.
 *
 * A module constant rather than a context, because there is exactly one and a
 * context would be machinery for a choice nobody makes at runtime. Swapping to
 * a layered-art or pre-rendered implementation is this line.
 */
const RENDERER = svgPortraitRenderer;

interface Props {
  /** players.avatar_seed. The one field a caller must have. */
  readonly seed: string | null;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly size?: PortraitSize;
  readonly heritage?: readonly string[] | null;
  readonly primary?: string;
  readonly secondary?: string;
  /** Off for a single portrait on a profile screen, where the observer is
   *  overhead for nothing. On by default, because most portraits are in lists. */
  readonly lazy?: boolean;
}

/** Up to two letters, from the name the caller already has. Never derived from
 *  anything else: a portrait does not know a player's name and must not make
 *  one up, so an empty name yields an empty mark rather than a guess. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((w) => w.length > 0);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * What a screen shows when there is no face to show.
 *
 * Three cases reach this and all three are real: a row whose seed has not been
 * backfilled, a renderer that returned null, and a render that threw. The
 * request asks that the UI never display a broken image; this is that
 * guarantee, and it is a silhouette with initials rather than a blank, so the
 * row still reads as a person.
 */
export function AvatarFallback({ name, size = 'list' }: { readonly name: string; readonly size?: PortraitSize }) {
  const px = PORTRAIT_PX[size];
  const mark = initials(name);
  return (
    <span
      role="img"
      aria-label={name === '' ? 'Player' : name}
      style={{
        width: px, height: px, flexShrink: 0, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        borderRadius: Math.max(6, Math.round(px * 0.24)),
        background: COLOR.raise, color: COLOR.mut,
        boxShadow: `inset 0 0 0 1px ${COLOR.line}`,
        fontFamily: FONT.ui, fontWeight: 600,
        fontSize: Math.max(9, Math.round(px * 0.36)), letterSpacing: '0.02em',
      }}
    >
      {mark === '' ? (
        // No name either. A head-and-shoulders silhouette, so the shape of the
        // row does not change just because a label is missing.
        <svg viewBox="0 0 100 100" width={px * 0.62} height={px * 0.62} aria-hidden="true">
          <circle cx={50} cy={36} r={20} fill={COLOR.line2} />
          <path d="M 14 100 Q 20 62 50 62 Q 80 62 86 100 Z" fill={COLOR.line2} />
        </svg>
      ) : mark}
    </span>
  );
}

/**
 * Whether this portrait has scrolled close enough to be worth drawing.
 *
 * The node is captured by a ref callback and the observing happens in an
 * effect, which is not a style preference: the first version created the
 * observer inside the ref callback and disconnected it from a separate
 * mount-only effect, so StrictMode's mount/unmount/remount tore the observer
 * down after the ref had already run and never rebuilt it. Every portrait in
 * the app stayed on its initials fallback forever. Setup and teardown belong
 * to the same effect.
 */
function useOnScreen(enabled: boolean): {
  readonly ref: (node: HTMLElement | null) => void; readonly shown: boolean;
} {
  const [shown, setShown] = useState(!enabled);
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || shown || node === null) return undefined;
    // jsdom and older engines have no IntersectionObserver. Drawing
    // immediately is the right failure: a face too early costs nothing, a face
    // that never appears is a bug.
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return undefined; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown(true);
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => { observer.disconnect(); };
  }, [enabled, shown, node]);

  return { ref: setNode, shown };
}

export function PlayerAvatar({
  seed, name, position, age, size = 'list', heritage, primary, secondary, lazy = true,
}: Props) {
  const { ref, shown } = useOnScreen(lazy);
  const px = PORTRAIT_PX[size];

  // The cache is keyed on the seed and the inputs that change the profile, so
  // a player whose birthday passed gets a fresh draw and a player scrolled
  // past twice does not.
  const profile = useMemo(
    () => (seed === null || !shown ? null : cachedProfile(seed, position, age, heritage ?? null)),
    [seed, position, age, heritage, shown],
  );

  const drawn: ReactNode = useMemo(() => {
    if (profile === null) return null;
    try {
      return RENDERER.render({
        profile, size, label: name,
        ...(primary === undefined ? {} : { primary }),
        ...(secondary === undefined ? {} : { secondary }),
      });
    } catch {
      // A renderer that throws is a renderer that is wrong, and the screen is
      // not the place to find that out. Swallowed deliberately: the fallback
      // below keeps the row readable, and the lab is where a broken face is
      // meant to be caught.
      return null;
    }
  }, [profile, size, primary, secondary, name]);

  if (seed === null) return <AvatarFallback name={name} size={size} />;

  return (
    <span
      ref={ref}
      style={{ width: px, height: px, flexShrink: 0, display: 'inline-flex' }}
    >
      {drawn ?? <AvatarFallback name={name} size={size} />}
    </span>
  );
}
