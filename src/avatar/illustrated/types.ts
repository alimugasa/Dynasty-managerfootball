// The one interface every visual family implements.
//
// The brief asks for clean component organisation and specifically rules out
// "one enormous SVG component containing hundreds of conditional branches".
// This is how that is enforced rather than intended: a family is a list of
// variants, a variant is an id, a label and a draw function, and the lab can
// render any variant of any family without knowing what family it is. Adding a
// nose is adding a row to an array.

import type { ReactNode } from 'react';
import type { FaceLayout } from './layout';
import type { HairPalette, SkinPalette } from './palette';
import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';

export interface DrawContext {
  /** Unique within the document. SVG gradient and clip ids are global, so two
   *  portraits on one screen sharing an id means one of them borrows the
   *  other's skin tone -- which is exactly the kind of bug that only shows up
   *  on a roster page. */
  readonly uid: string;
  /** The portrait's seed, for detail placement that has to be stable. */
  readonly seed: string;
  readonly layout: FaceLayout;
  readonly skin: SkinPalette;
  readonly hair: HairPalette;
  readonly brow: HairPalette;
  readonly morph: FaceMorph;
  readonly eyeColor: string;
  /** 0 at thumbnail size, 1 at hero size. Fine detail is drawn away below the
   *  threshold rather than drawn small: a lid crease at 28px is a smudge. */
  readonly detail: number;
  /** Years. A few details are age-gated, and nothing else reads it. */
  readonly age: number;
  readonly wear: number;
}

export interface Variant {
  readonly id: string;
  readonly label: string;
  readonly draw: (ctx: DrawContext) => ReactNode;
}

export interface Family {
  readonly kind: string;
  readonly variants: readonly Variant[];
}

export const pickVariant = (variants: readonly Variant[], id: string): Variant =>
  variants.find((v) => v.id === id) ?? (variants[0] as Variant);
