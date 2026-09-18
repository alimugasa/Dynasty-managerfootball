// AvatarRendererV2, behind the same interface as every other renderer.
//
// It reaches the profile only through `describe()`, which is the whole point of
// the descriptor: this file could be replaced by one that composites a
// commissioned art kit and nothing upstream would notice.

import type { AvatarProfile } from '../../../supabase/functions/_shared/avatar/profile';
import type { PortraitRenderer, PortraitRequest } from '../portrait';
import { describe } from './descriptor';
import { paintV2 } from './renderV2';

/** What it is drawn at, whatever it is shown at. V2 is expensive enough per
 *  pixel that rasterising per display size would be wasteful, and cheap enough
 *  once that nobody notices it happened. */
const raster = (px: number): number => (px <= 64 ? 192 : px <= 176 ? 320 : 448);

const cache = new Map<string, string>();
const CAPACITY = 300;

export function portraitV2DataUrl(
  profile: AvatarProfile, px: number, bare: boolean, shirt?: string,
): string | null {
  if (typeof document === 'undefined') return null;
  const size = raster(px);
  const d = describe(profile, { bare, ...(shirt === undefined ? {} : { shirt }) });
  const key = `${d.key}|${String(size)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;

  paintV2(ctx, size, d);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  if (cache.size > CAPACITY) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return url;
}

export function clearV2Cache(): void {
  cache.clear();
}

const SIZE_PX: Readonly<Record<PortraitRequest['size'], number>> = {
  thumb: 28, list: 40, card: 64, profile: 160, hero: 240,
};

export const avatarRendererV2: PortraitRenderer = {
  id: 'relief-v2',
  label: 'Lit relief portrait',
  render: (request: PortraitRequest) => {
    const px = SIZE_PX[request.size];
    const url = portraitV2DataUrl(
      request.profile, px, request.bare === true, request.primary,
    );
    if (url === null) return null;
    return (
      <img
        src={url} width={px} height={px} alt={request.label}
        style={{
          display: 'block', width: px, height: px,
          borderRadius: Math.max(6, Math.round(px * 0.22)), objectFit: 'cover',
        }}
      />
    );
  },
};
