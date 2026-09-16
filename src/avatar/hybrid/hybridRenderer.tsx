// The hybrid renderer.
//
// Same PortraitRenderer interface as every renderer before it, so switching to
// it is the one-word change in PlayerAvatar.tsx that the abstraction was built
// for. What is different is where the anatomy comes from: not from this file.
// There is no geometry here, no shading model and no face -- only a lookup, a
// composite, and a cache.
//
// With no artwork in the library it returns null for every request, which
// PortraitRenderer documents as a supported answer, and the caller falls back
// to initials. That is the deliberate behaviour and not a gap to be papered
// over: a drawn placeholder would be exactly the low-quality substitute the
// brief rules out.

import { useEffect, useMemo, useState } from 'react';
import type { AvatarProfile } from '../../../supabase/functions/_shared/avatar/profile';
import { describe } from '../v2/descriptor';
import { PORTRAIT_PX, type PortraitRenderer, type PortraitRequest, type PortraitSize } from '../portrait';
import { librarySnapshot, type LibraryState } from './library';
import { useHybridLibrary } from './useHybridLibrary';
import { planPortrait, type PlanResult } from './plan';
import { selectLayers } from './select';
import { compositePortrait } from './composite';

/** Profile to plan, in one call. The dev surface uses it to show what a player
 *  would load before any of it exists. */
export function planFor(
  profile: AvatarProfile, state: LibraryState, bare = false,
): PlanResult | null {
  if (state.status !== 'ready' && state.status !== 'empty') return null;
  const descriptor = describe(profile, { bare });
  const selection = selectLayers(descriptor);
  return planPortrait(state.manifest, selection, descriptor.key);
}

/* --------------------------------------------------------------- cache -- */

const portraits = new Map<string, string>();
const CAPACITY = 400;

function remember(key: string, dataUrl: string): void {
  portraits.set(key, dataUrl);
  if (portraits.size > CAPACITY) {
    const oldest = portraits.keys().next();
    if (!oldest.done) portraits.delete(oldest.value);
  }
}

/* ------------------------------------------------------------ renderer -- */

function HybridPortrait({ profile, size, label, bare }: {
  readonly profile: AvatarProfile;
  readonly size: PortraitSize;
  readonly label: string;
  readonly bare: boolean;
}) {
  const library = useHybridLibrary();
  const px = PORTRAIT_PX[size];
  const result = useMemo(() => planFor(profile, library, bare), [profile, library, bare]);
  const key = result !== null && result.ok ? `${result.plan.key}@${String(px)}` : null;
  const [dataUrl, setDataUrl] = useState<string | null>(
    key === null ? null : portraits.get(key) ?? null,
  );

  useEffect(() => {
    if (key === null || result === null || !result.ok) return undefined;
    const cached = portraits.get(key);
    if (cached !== undefined) { setDataUrl(cached); return undefined; }
    let live = true;
    void compositePortrait(result.plan, px).then((out) => {
      if (!live || !out.ok) return;
      remember(key, out.dataUrl);
      setDataUrl(out.dataUrl);
    });
    return () => { live = false; };
  }, [key, px, result]);

  if (dataUrl === null) return null;
  return (
    <img
      src={dataUrl}
      alt={label}
      width={px}
      height={px}
      style={{ display: 'block', width: px, height: px, borderRadius: '50%' }}
    />
  );
}

/**
 * The renderer.
 *
 * `render` returns null the moment it can tell it has nothing to draw -- an
 * absent library, an invalid manifest, an unpainted coordinate -- rather than
 * mounting a component that will decide the same thing a frame later. A
 * portrait that appears and then vanishes is worse than one that never
 * appeared.
 */
export const hybridPortraitRenderer: PortraitRenderer = {
  id: 'hybrid',
  label: 'Hybrid (layered art)',
  render(request: PortraitRequest) {
    const state = librarySnapshot();
    if (state.status !== 'ready') return null;
    const result = planFor(request.profile, state, request.bare === true);
    if (result === null || !result.ok) return null;
    return (
      <HybridPortrait
        profile={request.profile}
        size={request.size}
        label={request.label}
        bare={request.bare === true}
      />
    );
  },
};
