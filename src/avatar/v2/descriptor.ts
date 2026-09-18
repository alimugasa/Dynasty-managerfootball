// What to draw, with no opinion about how.
//
// The mandated separation, and the reason it is mandated: until now every
// renderer reached straight into AvatarProfile, so "who this player is" and
// "how this renderer likes its inputs" were the same object. That is fine
// until the second renderer arrives and wants the same facts in a different
// shape -- at which point identity starts growing fields that exist for a
// drawing technique.
//
//   AvatarProfile          who he is
//        v  describe()
//   AvatarRenderDescriptor what to draw   <- this file
//        v
//   AvatarRenderer         how to draw it
//
// Everything below is a number, a string id, or a hex colour. There is nothing
// here about canvases, meshes, SVG paths, image layers or texture atlases, and
// a renderer may not reach past this to the profile. A commissioned art kit
// consumes exactly this, which is what makes that upgrade a swap rather than a
// rewrite.

import type { AvatarProfile } from '../../../supabase/functions/_shared/avatar/profile';
import { faceMorph, type FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import { skinColor } from '../../../supabase/functions/_shared/avatar/skin';
import { HAIRSTYLES, HAIR_COLORS, textureFamily } from '../../../supabase/functions/_shared/avatar/hair';

export type HairFamily = 'straight' | 'wavy' | 'curly' | 'coily';
export type HairLength = 'none' | 'short' | 'medium' | 'long';

/** Colours, resolved. A renderer is handed hex, never a trait name to look up:
 *  the moment two renderers resolve the same name differently, one player has
 *  two eye colours. */
export interface DescriptorColour {
  readonly skin: string;
  readonly undertone: string;
  /** 0 = deepest pigment, 1 = lightest. Renderers need the position on the
   *  scale, not just the colour, because contrast behaves differently along it. */
  readonly pigment: number;
  readonly eye: string;
  readonly hair: string;
  /** Brows follow the natural colour, not a bleach job. */
  readonly brow: string;
}

export interface DescriptorHair {
  readonly styleId: string;
  readonly textureId: string;
  readonly family: HairFamily;
  readonly length: HairLength;
  /** 0-1: how far the mass stands off the skull. */
  readonly volume: number;
  /** 0-1: how far it falls past the ear. */
  readonly fall: number;
  /** 0-1: how hard the sides taper toward skin. */
  readonly fade: number;
  /** True for locs, twists, braids and cornrows: a different construction, not
   *  a different silhouette. */
  readonly roped: boolean;
  readonly recession: number;
  readonly greying: number;
}

export interface DescriptorFacialHair {
  readonly styleId: string;
  /** 0-1. */
  readonly density: number;
  /** Hair length in face units; 0 is stubble. */
  readonly length: number;
}

export interface DescriptorAge {
  readonly years: number;
  /** 0-1: lines, weathering, the set of the face. */
  readonly wear: number;
}

export interface DescriptorBody {
  /** All -1..1, from the position-weighted build. */
  readonly neck: number;
  readonly traps: number;
  readonly shoulders: number;
  readonly shirt: string;
  readonly shirtTrim: string;
}

export interface AvatarRenderDescriptor {
  /** Everything that makes this portrait this portrait. Renderers cache on it;
   *  two descriptors with the same key must produce the same picture. */
  readonly key: string;
  /** The ~55 facial dimensions. Renderer-agnostic by construction: nothing in
   *  FaceMorph names a drawing technique. */
  readonly geometry: FaceMorph;
  readonly colour: DescriptorColour;
  readonly hair: DescriptorHair;
  readonly facialHair: DescriptorFacialHair;
  readonly age: DescriptorAge;
  readonly body: DescriptorBody;
  readonly complexion: string;
  readonly accessory: string;
  readonly expression: string;
  /** The face-only test: hair, facial hair and accessories off, one shirt for
   *  everybody. Part of the descriptor rather than a renderer flag, so every
   *  renderer is asked the same question the same way. */
  readonly bare: boolean;
}

export interface DescribeOptions {
  readonly bare?: boolean;
  readonly shirt?: string;
  readonly shirtTrim?: string;
}

const hairHex = (id: string): string =>
  HAIR_COLORS.find((c) => c.id === id)?.hex ?? '#14100e';

const BEARD_LENGTH: Readonly<Record<string, number>> = {
  'beard-long': 34, 'beard-full': 22, 'beard-medium': 20, 'beard-connected': 20,
  'beard-short': 12, 'beard-boxed': 12, 'beard-tapered': 12, 'beard-patchy': 10,
  'beard-disconnected': 14,
};

const DENSITY: Readonly<Record<string, number>> = {
  sparse: 0.34, light: 0.52, medium: 0.72, thick: 0.86, dense: 1,
};

function hairShape(styleId: string, family: HairFamily): {
  length: HairLength; volume: number; fall: number; fade: number; roped: boolean;
} {
  const length = HAIRSTYLES.find((h) => h.id === styleId)?.length ?? 'short';
  const has = (w: string): boolean => styleId.includes(w);
  const byFamily = { straight: 1, wavy: 1.5, curly: 2.3, coily: 3.0 }[family];
  const byLength = { none: 0, short: 1, medium: 2.1, long: 3.2 }[length];
  return {
    length,
    volume: Math.min(1, ((has('afro') ? 46 : 12) + byFamily * byLength * 9) / 90),
    fall: length === 'long' ? 1 : length === 'medium' ? 0.36 : 0,
    fade: has('fade') || has('taper') ? 1 : has('buzz') || has('crew') ? 0.35 : 0,
    roped: has('locs') || has('braid') || has('twist') || has('cornrow'),
  };
}

/**
 * A profile, described.
 *
 * The one place `AvatarProfile` is read on the rendering side of the system.
 * Everything downstream sees only what comes back from here.
 */
export function describe(
  profile: AvatarProfile, opts: DescribeOptions = {},
): AvatarRenderDescriptor {
  const i = profile.identity;
  const a = profile.appearance;
  const bare = opts.bare === true;
  const family = textureFamily(i.hairTexture);
  const shape = hairShape(a.hairstyle, family);
  const skin = skinColor(i.skinStep, i.undertone);
  const shirt = bare ? '#232b33' : opts.shirt ?? '#2a3239';
  const geometry = faceMorph(profile);

  return {
    key: [profile.seed, String(a.age), a.hairstyle, a.hairColor, a.facialHair,
      a.accessory, bare ? 'bare' : 'full', shirt].join('|'),
    geometry,
    colour: {
      skin,
      undertone: i.undertone,
      pigment: i.skinStep / 35,
      eye: i.eyeColor,
      hair: hairHex(a.hairColor),
      brow: hairHex(i.naturalHairColor),
    },
    hair: {
      styleId: a.hairstyle,
      textureId: i.hairTexture,
      family,
      ...shape,
      recession: a.recession,
      greying: a.greying,
    },
    facialHair: {
      styleId: a.facialHair,
      density: DENSITY[a.facialHairDensity] ?? 0.72,
      length: BEARD_LENGTH[a.facialHair] ?? (a.facialHair.startsWith('stubble') ? 0 : 9),
    },
    age: { years: a.age, wear: a.ageWear },
    body: {
      // Straight off the morph, which already folded the position-weighted
      // build into these three. A second opinion here is how a lineman ends up
      // with a lineman's neck and a corner's shoulders.
      neck: geometry.neckWidth,
      traps: geometry.trapSize,
      shoulders: geometry.shoulderWidth,
      shirt,
      shirtTrim: opts.shirtTrim ?? '#1a2026',
    },
    complexion: bare ? 'none' : i.complexion,
    accessory: bare ? 'none' : a.accessory,
    expression: a.expression,
    bare,
  };
}
