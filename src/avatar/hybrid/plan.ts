// A selection, resolved against a library.
//
// Everything above this file is true whether or not a single pixel has been
// painted. This is where that stops: a plan is an ordered list of real URLs
// with real tints, and when the library cannot supply one, the answer is a
// list of what is missing rather than a substitution nobody asked for.
//
// Layer order is fixed here and nowhere else. It is the order in
// docs/AVATAR-ASSET-SPEC.md §4, and it is split the way it is because an
// earlier renderer put a player's own hair behind his forehead: the mass
// behind the skull and the fall in front of it are different files composited
// at different depths, not one layer with a z-index problem.

import type { AssetAnchors, AssetManifest, BaseFaceAsset } from './manifest';
import type { PortraitSelection } from './select';

export type Blend = 'normal' | 'multiply' | 'overlay' | 'soft-light';

export type LayerKind =
  | 'background' | 'clothing-back' | 'hair-back' | 'base-albedo' | 'base-shading'
  | 'complexion' | 'age' | 'facial-hair' | 'hair-front' | 'accessory' | 'clothing-front';

export interface PlanLayer {
  readonly kind: LayerKind;
  readonly url: string;
  readonly blend: Blend;
  readonly opacity: number;
  /** Hex, for a greyscale layer the compositor colours. Null means the file is
   *  already the colour the artist intended. */
  readonly tint: string | null;
  /** Layers that move with the face. The background and the clothing do not:
   *  warping a jersey collar with a cheekbone is how a shoulder ends up with a
   *  dent in it. */
  readonly warped: boolean;
  /** Clipped to the base face's skin mask. Complexion and age overlays are;
   *  hair and accessories are not. */
  readonly masked: boolean;
}

export interface MissingAsset {
  readonly kind: string;
  /** What would satisfy it, in the vocabulary of the spec. */
  readonly need: string;
}

/** A base face that is not the exact coordinate asked for. Recorded rather
 *  than silently accepted: a league drawn half on substitutes is a fact about
 *  the library's coverage, and the dev surface says so. */
export interface Substitution {
  readonly wanted: string;
  readonly used: string;
  readonly why: string;
}

export interface PortraitPlan {
  readonly key: string;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly anchors: AssetAnchors;
  readonly layers: readonly PlanLayer[];
  /** The skin mask, kept out of `layers` because it is not drawn -- it is what
   *  `masked` layers are clipped to. */
  readonly maskUrl: string;
  /** How far the tint has to carry the painted anchor, in steps on the 36-step
   *  scale. Large numbers mean the library needs another pigment anchor, not
   *  that the compositor should push harder. */
  readonly pigmentDistance: number;
  readonly pigmentHex: string;
  readonly warp: readonly (readonly [number, number])[];
  readonly substitutions: readonly Substitution[];
}

export type PlanResult =
  | { readonly ok: true; readonly plan: PortraitPlan }
  | { readonly ok: false; readonly missing: readonly MissingAsset[] };

/** The library's runtime root. `public/` is served from the site root, so this
 *  is literally the path the brief named. */
export const ASSET_ROOT = '/avatar-assets/';

const url = (dir: string, path: string): string => `${ASSET_ROOT}${dir}/${path}`;

/**
 * Pick the base face.
 *
 * Exact coordinate first; then the same structure and pigment in the other age
 * band, because the age overlay can carry that difference; then the same
 * structure at the nearest pigment anchor, because a tint can carry some of
 * that. Structure is never substituted -- a player with the wrong skull is a
 * different man, and showing initials is better than showing somebody else.
 */
function pickBase(
  manifest: AssetManifest, sel: PortraitSelection,
): { readonly face: BaseFaceAsset; readonly why: string | null } | null {
  const anchors = manifest.pigmentAnchors;
  if (anchors.length === 0) return null;
  const nearest = anchors.reduce((best, a) =>
    Math.abs(a.step - sel.pigment.targetStep) < Math.abs(best.step - sel.pigment.targetStep) ? a : best);

  const family = manifest.baseFaces.filter((b) => b.structure === sel.structure);
  if (family.length === 0) return null;

  const exact = family.find((b) => b.pigment === nearest.id && b.age === sel.ageBand);
  if (exact !== undefined) return { face: exact, why: null };

  const otherAge = family.find((b) => b.pigment === nearest.id);
  if (otherAge !== undefined) {
    return { face: otherAge, why: `no ${sel.ageBand} band painted; the age overlay carries it` };
  }

  const step = (id: string): number => anchors.find((p) => p.id === id)?.step ?? 99;
  const byPigment = family.reduce((best, b) =>
    Math.abs(step(b.pigment) - sel.pigment.targetStep)
      < Math.abs(step(best.pigment) - sel.pigment.targetStep) ? b : best);
  return { face: byPigment, why: `pigment anchor "${nearest.id}" not painted for this structure` };
}

/**
 * Resolve a selection into something a compositor can draw.
 *
 * Returns the complete list of what is missing rather than the first gap, for
 * the same reason parseManifest does: the point of the list is to hand it to
 * whoever is filling the library.
 */
export function planPortrait(
  manifest: AssetManifest, sel: PortraitSelection, key: string,
): PlanResult {
  const missing: MissingAsset[] = [];
  const subs: Substitution[] = [];
  const layers: PlanLayer[] = [];

  const wantedBase = `${sel.structure}-<pigment>-${sel.ageBand}`;
  const base = pickBase(manifest, sel);
  if (base === null) {
    missing.push({ kind: 'base-face', need: `base set ${wantedBase} (albedo, shading, mask)` });
  } else if (base.why !== null) {
    subs.push({ wanted: wantedBase, used: base.face.id, why: base.why });
  }

  const ground = manifest.background[0];
  if (ground === undefined) {
    missing.push({ kind: 'background', need: 'one studio sweep in background/' });
  } else {
    layers.push({
      kind: 'background', url: url('background', ground.file), blend: 'normal',
      opacity: 1, tint: null, warped: false, masked: false,
    });
  }

  const cloth = manifest.clothing.find((c) => c.builds.includes(sel.buildId));
  if (cloth === undefined) {
    missing.push({ kind: 'clothing', need: `shoulders and collar for build "${sel.buildId}"` });
  } else {
    layers.push({
      kind: 'clothing-back', url: url('clothing', cloth.back), blend: 'normal',
      opacity: 1, tint: null, warped: false, masked: false,
    });
  }

  const hair = sel.hairStyleId === null
    ? null
    : manifest.hair.find((h) => h.styles.includes(sel.hairStyleId as string));
  if (sel.hairStyleId !== null && hair === undefined) {
    missing.push({ kind: 'hair', need: `a ${sel.hairFamily} layer serving style "${sel.hairStyleId}"` });
  }
  if (hair != null && hair.back !== null) {
    layers.push({
      kind: 'hair-back', url: url('hair', hair.back), blend: 'normal',
      opacity: 1, tint: greyed(sel.hairHex, sel.greying), warped: true, masked: false,
    });
  }

  if (base !== null) {
    layers.push({
      kind: 'base-albedo', url: url('base-faces', base.face.albedo), blend: 'normal',
      opacity: 1, tint: sel.pigment.hex, warped: true, masked: false,
    });
    layers.push({
      kind: 'base-shading', url: url('base-faces', base.face.shading), blend: 'multiply',
      opacity: 1, tint: null, warped: true, masked: false,
    });
  }

  const complexion = sel.complexionId === null
    ? undefined
    : manifest.complexion.find((o) => o.id === sel.complexionId);
  if (sel.complexionId !== null && complexion === undefined) {
    missing.push({ kind: 'complexion', need: `overlay "${sel.complexionId}"` });
  } else if (complexion !== undefined) {
    layers.push({
      kind: 'complexion', url: url('complexion', complexion.file), blend: 'soft-light',
      opacity: complexion.strength, tint: null, warped: true, masked: true,
    });
  }

  const ageLayer = manifest.age[0];
  if (sel.ageOverlayStrength > 0.05) {
    if (ageLayer === undefined) {
      missing.push({ kind: 'age', need: 'at least one weathering overlay in age/' });
    } else {
      layers.push({
        kind: 'age', url: url('age', ageLayer.file), blend: 'multiply',
        opacity: ageLayer.strength * sel.ageOverlayStrength, tint: null,
        warped: true, masked: true,
      });
    }
  }

  const beard = sel.facialHairId === null
    ? undefined
    : manifest.facialHair.find((f) => f.styles.includes(sel.facialHairId as string));
  if (sel.facialHairId !== null && beard === undefined) {
    missing.push({ kind: 'facial-hair', need: `a layer serving style "${sel.facialHairId}"` });
  } else if (beard !== undefined) {
    layers.push({
      kind: 'facial-hair', url: url('facial-hair', beard.file), blend: 'normal',
      opacity: 0.55 + sel.facialHairStrength * 0.45,
      tint: greyed(sel.facialHairHex, sel.greying), warped: true, masked: false,
    });
  }

  if (hair != null) {
    layers.push({
      kind: 'hair-front', url: url('hair', hair.front), blend: 'normal',
      opacity: 1, tint: greyed(sel.hairHex, sel.greying), warped: true, masked: false,
    });
  }

  const acc = sel.accessoryId === null
    ? undefined
    : manifest.accessories.find((o) => o.id === sel.accessoryId);
  if (sel.accessoryId !== null && acc === undefined) {
    missing.push({ kind: 'accessory', need: `layer "${sel.accessoryId}"` });
  } else if (acc !== undefined) {
    layers.push({
      kind: 'accessory', url: url('accessories', acc.file), blend: 'normal',
      opacity: acc.strength, tint: null, warped: true, masked: false,
    });
  }

  if (cloth !== undefined) {
    layers.push({
      kind: 'clothing-front', url: url('clothing', cloth.front), blend: 'normal',
      opacity: 1, tint: null, warped: false, masked: false,
    });
  }

  if (missing.length > 0 || base === null) return { ok: false, missing };

  const anchorStep = manifest.pigmentAnchors.find((p) => p.id === base.face.pigment)?.step ?? 0;
  return {
    ok: true,
    plan: {
      key,
      canvas: manifest.canvas,
      anchors: manifest.anchors,
      layers,
      maskUrl: url('base-faces', base.face.mask),
      pigmentDistance: Math.abs(sel.pigment.targetStep - anchorStep),
      pigmentHex: sel.pigment.hex,
      warp: sel.warp,
      substitutions: subs,
    },
  };
}

/** Grey is not a hair colour in the trait library, it is a proportion of the
 *  strands that have lost theirs -- so it is a blend toward a neutral rather
 *  than a swap for a different hex. */
function greyed(hex: string, greying: number): string {
  if (greying <= 0) return hex;
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number, g: number): number => Math.round(c + (g - c) * Math.min(1, greying));
  const r = mix((n >> 16) & 255, 0xc9);
  const g = mix((n >> 8) & 255, 0xc4);
  const b = mix(n & 255, 0xbe);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
