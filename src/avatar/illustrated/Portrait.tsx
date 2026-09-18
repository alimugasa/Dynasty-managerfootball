// One portrait, assembled.
//
// This file is deliberately the only place that knows the drawing order, and
// the order is most of the art direction: the beard goes under the mouth, the
// ears go under the hair, the shading goes over the skin and under the
// features, the jersey goes over everything. Every one of those was a visible
// bug in an earlier renderer before it was a rule here.

import { useId, useMemo } from 'react';
import type { AvatarIdentity, AvatarProfile } from '../../../supabase/functions/_shared/avatar/profile';
import { faceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import { skinColor } from '../../../supabase/functions/_shared/avatar/skin';
import { hairPalette, skinPalette } from './palette';
import { buildFace, VIEW_H, VIEW_W } from './layout';
import { headShape } from './heads/shapes';
import { Head, HeadClip } from './heads/Head';
import { Shading, ShadingDefs } from './shading/Shading';
import { Eyes } from './eyes/Eyes';
import { Brows } from './brows/Brows';
import { Nose } from './noses/Nose';
import { Mouth } from './mouths/Mouth';
import { Ears } from './ears/Ears';
import { Hair, HairBack } from './hair/Hair';
import { FacialHair } from './facialHair/FacialHair';
import { Accessory, AgeLines, Complexion } from './details/Details';
import { Jersey, Neck } from './body/Body';
import { selectFeatures } from './select';
import { HAIR_COLORS, FACIAL_HAIR_DENSITY } from '../../../supabase/functions/_shared/avatar/hair';
import type { DrawContext } from './types';

/* The presentation, matched to the reference: a flat dark navy ground, a dark
   jersey a shade above it, and a light collar. Flat rather than vignetted --
   a radial backdrop pulls the eye to the middle of the frame and makes twenty
   portraits in a grid look like twenty spotlights. */
export const BACKDROP = '#19212C';
const SHIRT = '#2C3644';
const COLLAR = '#B9C2CC';

export interface IllustratedPortraitProps {
  readonly profile: AvatarProfile;
  /** Rendered WIDTH in CSS pixels. Height follows the frame's own aspect --
   *  the reference's portraits are portrait-shaped, and a square crop either
   *  letterboxes the drawing or squashes it. */
  readonly px: number;
  /** The face-only test: no hair, no facial hair, no accessories, one shirt. */
  readonly bare?: boolean;
  readonly shirt?: string;
  readonly collar?: string;
  readonly background?: string;
  /** Overrides, for the feature library page. */
  readonly override?: Partial<ReturnType<typeof selectFeatures>>;
  /** Lab-only paint override: holds pigmentation fixed without changing the
   *  profile or the morph, so the face structure can be judged on its own. */
  readonly diagnosticSkinTone?: Pick<AvatarIdentity, 'skinStep' | 'undertone'>;
  readonly label?: string;
}

const hairHex = (id: string): string =>
  HAIR_COLORS.find((c) => c.id === id)?.hex ?? '#14100e';

export function IllustratedPortrait({
  profile, px, bare = false, shirt = SHIRT, collar = COLLAR,
  background = BACKDROP, override, diagnosticSkinTone, label = '',
}: IllustratedPortraitProps) {
  // A player may appear more than once, with different feature overrides.
  // Scope paint servers to the mounted portrait, not the player's seed, so
  // library tiles cannot borrow another tile's clip or shading coordinates.
  // This DOM id never participates in identity, geometry or trait selection.
  const uid = `ip${useId().replace(/:/g, '')}`;

  const morph = useMemo(() => faceMorph(profile), [profile]);
  const picked = useMemo(() => selectFeatures(profile, morph), [profile, morph]);
  const sel = { ...picked, ...override };

  const i = profile.identity;
  const a = profile.appearance;
  const tone = diagnosticSkinTone ?? i;
  const skinHex = skinColor(tone.skinStep, tone.undertone);
  const layout = useMemo(() => buildFace(headShape(sel.head), morph), [sel.head, morph]);

  const ctx: DrawContext = {
    uid,
    seed: profile.seed,
    layout,
    skin: skinPalette(skinHex, tone.skinStep / 35),
    hair: hairPalette(hairHex(a.hairColor)),
    brow: hairPalette(hairHex(i.naturalHairColor)),
    morph,
    eyeColor: i.eyeColor,
    detail: px >= 160 ? 1 : px >= 96 ? 0.6 : px >= 56 ? 0.42 : 0.2,
    age: a.age,
    wear: a.ageWear,
  };

  const hairId = bare ? 'bald' : a.hairstyle;
  const beardId = bare ? 'clean' : a.facialHair;
  const density = FACIAL_HAIR_DENSITY.indexOf(a.facialHairDensity) < 0
    ? 0.6
    : (FACIAL_HAIR_DENSITY.indexOf(a.facialHairDensity) + 1) / FACIAL_HAIR_DENSITY.length;

  return (
    <svg
      viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
      width={px} height={Math.round((px * VIEW_H) / VIEW_W)}
      role={label === '' ? 'presentation' : 'img'}
      aria-label={label === '' ? undefined : label}
      style={{ display: 'block' }}
    >
      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={background} />

      <ShadingDefs ctx={ctx} />
      <HeadClip ctx={ctx} />

      <HairBack ctx={ctx} id={hairId} recession={a.recession} greying={a.greying} />
      <Neck ctx={ctx} />
      <Head ctx={ctx} />
      <Ears ctx={ctx} id={sel.ears} />
      <Shading ctx={ctx} />
      <FacialHair ctx={ctx} id={beardId} density={density} greying={a.greying} />
      <Brows ctx={ctx} id={sel.brows} />
      <Eyes ctx={ctx} id={sel.eyes} />
      <Nose ctx={ctx} id={sel.nose} />
      <Mouth ctx={ctx} id={sel.mouth} />
      {!bare && <Complexion ctx={ctx} id={i.complexion} />}
      <AgeLines ctx={ctx} />
      <Hair ctx={ctx} id={hairId} recession={a.recession} greying={a.greying} />
      {!bare && <Accessory ctx={ctx} id={a.accessory} />}
      <Jersey ctx={ctx} shirt={shirt} collar={collar} />
    </svg>
  );
}
