// The renderer, behind the interface the rest of the app already talks to.
//
// Two things happen here and nothing else: a portrait is rasterised once per
// (player, size, bareness) and handed back as an <img>. Everything a screen
// sees is a cached image element, so a fifty-row roster costs fifty image
// decodes rather than fifty live canvases, and scrolling past a player twice
// costs nothing the second time.
//
// `render` returning null is a supported answer, not a failure: a browser with
// no 2D context -- and jsdom, where the component tests run -- gets initials
// instead, which is the guarantee that a broken face never reaches a screen.

import type { AvatarProfile } from '../../../supabase/functions/_shared/avatar/profile';
import type { PortraitRenderer, PortraitRequest } from '../portrait';
import { paintPortrait } from './render';

/** What the portrait is actually drawn at, whatever it is displayed at.
 *
 *  Two tiers, not five. A 28px thumbnail and a 40px list row are the same
 *  picture scaled, so they share one cache entry; anything card-sized and up
 *  gets the detailed one. Rasterising per display size would triple the work
 *  for a difference nobody can see. */
const raster = (px: number): number => (px <= 64 ? 192 : 512);

const cache = new Map<string, string>();
const CAPACITY = 400;

/**
 * A portrait as a data URL.
 *
 * Exported because the lab wants the same pixels without a React tree around
 * them, and because a test can assert on the bytes.
 */
export function portraitDataUrl(
  profile: AvatarProfile, px: number, bare: boolean,
  primary?: string, secondary?: string,
): string | null {
  if (typeof document === 'undefined') return null;
  const size = raster(px);
  const key = `${profile.seed}|${String(size)}|${bare ? 'bare' : 'full'}|${primary ?? ''}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;

  paintPortrait(ctx, size, profile, {
    bare,
    ...(primary === undefined ? {} : { primary }),
    ...(secondary === undefined ? {} : { secondary }),
  });

  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  if (cache.size > CAPACITY) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return url;
}

export function clearRasterCache(): void {
  cache.clear();
}

export const rasterPortraitRenderer: PortraitRenderer = {
  id: 'raster-v1',
  label: 'Painted portrait',
  render: (request: PortraitRequest) => {
    const px = SIZE_PX[request.size];
    const url = portraitDataUrl(
      request.profile, px, request.bare === true, request.primary, request.secondary,
    );
    if (url === null) return null;
    return (
      <img
        src={url}
        width={px}
        height={px}
        alt={request.label}
        style={{
          display: 'block',
          width: px,
          height: px,
          borderRadius: Math.max(6, Math.round(px * 0.22)),
          objectFit: 'cover',
        }}
      />
    );
  },
};

const SIZE_PX: Readonly<Record<PortraitRequest['size'], number>> = {
  thumb: 28, list: 40, card: 64, profile: 160, hero: 240,
};
