// The seam between "who this player is" and "how he is drawn".
//
// The request is explicit that the renderer must be replaceable: layered 2D
// art, pre-rendered portraits or a 3D model should be able to take over
// "without rewriting player identity logic". So identity logic does not know
// what a renderer is, and a renderer does not know what a seed is. What
// crosses between them is an AvatarProfile and nothing else.
//
// What ships today is code-generated vector portraiture (svgPortrait.tsx),
// because that is what this project can actually support: there are no image
// assets anywhere in it, no asset pipeline, and docs/IP-POLICY.md rules out
// the obvious shortcut of sourcing photographic faces. A better renderer is a
// new implementation of this interface and a one-line change in the registry
// below -- not a rewrite of anything under _shared/avatar/.

import type { ReactNode } from 'react';
import type { AvatarProfile } from '../../supabase/functions/_shared/avatar/profile';

/**
 * How large, and therefore how much detail.
 *
 * Named by where they are used rather than by pixel count, because the point
 * of the tier is what gets drawn, not what gets scaled. A 28px portrait that
 * renders eyelids is a smudge; a 240px one that does not is a mask.
 */
export const PORTRAIT_SIZES = ['thumb', 'list', 'card', 'profile', 'hero'] as const;
export type PortraitSize = (typeof PORTRAIT_SIZES)[number];

export const PORTRAIT_PX: Readonly<Record<PortraitSize, number>> = {
  thumb: 28, list: 40, card: 64, profile: 160, hero: 240,
};

/** Below this, fine detail is drawn away rather than drawn small. */
export const DETAIL_FLOOR = 56;

export interface PortraitRequest {
  readonly profile: AvatarProfile;
  readonly size: PortraitSize;
  /** The club's colours, for the backdrop. Absent for a free agent, who gets
   *  a neutral ground rather than somebody else's. */
  readonly primary?: string;
  readonly secondary?: string;
  /** What a screen reader says. Never invented here: a portrait does not know
   *  a player's name and must not guess one. */
  readonly label: string;
}

/**
 * Something that can draw a face.
 *
 * `render` may return null, and that is a supported answer rather than a
 * failure to handle: a renderer that cannot draw this profile -- an asset pack
 * missing a trait, a canvas that would not initialise -- says so, and the
 * caller falls back to initials. The request asks that the UI never show a
 * broken image, and a nullable return is how that is guaranteed rather than
 * hoped for.
 */
export interface PortraitRenderer {
  readonly id: string;
  readonly label: string;
  render: (request: PortraitRequest) => ReactNode | null;
}
