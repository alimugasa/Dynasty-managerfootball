// Which artwork this player needs.
//
// Pure, synchronous, and completely ignorant of whether any of it exists: this
// file turns a descriptor into a list of requirements, and resolving those
// against a library is plan.ts's job. Keeping the two apart is what lets the
// selection be tested -- and demonstrated on screen -- with an empty asset
// directory, which is the situation this repository is actually in.
//
// The one idea worth understanding here is that a base face is a *coordinate*,
// not a player. Twelve authored structure families, three painted pigment
// anchors and two age bands cover the space; everything that makes a player
// himself rather than one of seventy-two is carried by the tint, the overlays,
// the hair, and a bounded warp. docs/AVATAR-ASSET-SPEC.md §5 has the
// arithmetic and, more importantly, its limits.

import type { AvatarRenderDescriptor } from '../v2/descriptor';
import type { AgeBand } from './manifest';

/** The lattice: skull width (2) x skull length (2) x midface breadth (3). */
export const STRUCTURE_FAMILIES = 12;

/** No control point moves further than this fraction of head width. The bound
 *  is the point of the warp, not a limitation of it: wider and it stops being
 *  a variation on an artist's face and starts being a deformation of one. */
export const WARP_LIMIT = 0.03;

export const WARP_COLS = 5;
export const WARP_ROWS = 7;

export interface PigmentRequest {
  /** Which painted anchor to start from, by step on the 36-point scale. The
   *  manifest names the anchors; selection asks for the nearest by step and
   *  plan.ts does the naming. */
  readonly targetStep: number;
  readonly undertone: string;
  /** The exact colour the tint has to arrive at. */
  readonly hex: string;
}

export interface PortraitSelection {
  /** `s0`..`s11`. */
  readonly structure: string;
  readonly ageBand: AgeBand;
  readonly pigment: PigmentRequest;
  /** Hairstyle id from the trait library, or null when the player is shaved or
   *  the portrait is bare. A hair layer is not required to exist for every id:
   *  the manifest maps many ids onto one file. */
  readonly hairStyleId: string | null;
  readonly hairFamily: string;
  readonly hairHex: string;
  readonly greying: number;
  readonly facialHairId: string | null;
  readonly facialHairHex: string;
  readonly facialHairStrength: number;
  readonly complexionId: string | null;
  readonly ageOverlayStrength: number;
  readonly accessoryId: string | null;
  readonly buildId: string;
  /** (WARP_COLS * WARP_ROWS) x 2 offsets, in fractions of head width, already
   *  clamped to WARP_LIMIT. */
  readonly warp: readonly (readonly [number, number])[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Split [-1, 1] into `n` equal buckets. Equal rather than population-weighted
 *  because the artist is asked to paint the corners as well as the middle: a
 *  lattice that crowds ten families into the average skull leaves the two
 *  extremes sharing one. */
function bucket(v: number, n: number): number {
  return clamp(Math.floor(((clamp(v, -1, 1) + 1) / 2) * n), 0, n - 1);
}

/**
 * The structure family.
 *
 * Four morph dimensions decide the silhouette and therefore decide which
 * authored skull is the right starting point. Jaw and cheekbone are averaged
 * into one "midface breadth" axis rather than getting an axis each, because a
 * wide jaw under fine cheekbones and the reverse are a modelling difference
 * the overlays and the warp can carry, while a long narrow skull and a short
 * broad one are not.
 */
export function structureFamily(g: AvatarRenderDescriptor['geometry']): string {
  const width = bucket(g.skullWidth, 2);
  const length = bucket(g.skullLength, 2);
  const breadth = bucket((g.jawWidth + g.cheekboneWidth) / 2, 3);
  return `s${String(width * 6 + length * 3 + breadth)}`;
}

export const ageBandFor = (years: number): AgeBand => (years >= 33 ? 'veteran' : 'prime');

/**
 * The warp.
 *
 * Driven by exactly the dimensions the lattice above threw away -- the residue
 * within a bucket, plus the asymmetry terms, which no lattice can carry
 * because asymmetry is the one thing a symmetric painting cannot have. Every
 * offset is clamped, and the row containing the eye line is clamped harder
 * still: moving the eyes off the anchor is how a hair layer stops fitting.
 */
export function warpGrid(g: AvatarRenderDescriptor['geometry']): readonly (readonly [number, number])[] {
  const residue = (v: number, n: number): number =>
    ((clamp(v, -1, 1) + 1) / 2) * n - bucket(v, n) - 0.5;

  const rx = residue(g.skullWidth, 2) * 2;
  const ry = residue(g.skullLength, 2) * 2;
  const rb = residue((g.jawWidth + g.cheekboneWidth) / 2, 3) * 2;
  const asym = [g.asymEye, g.asymBrow, g.asymNose, g.asymMouth, g.asymJaw];

  const out: (readonly [number, number])[] = [];
  for (let row = 0; row < WARP_ROWS; row += 1) {
    const t = row / (WARP_ROWS - 1);
    // Rows 2 and 3 straddle the eye line; the anchors have to survive.
    const anchored = row === 2 || row === 3 ? 0.35 : 1;
    for (let col = 0; col < WARP_COLS; col += 1) {
      const s = col / (WARP_COLS - 1);
      const side = s - 0.5;
      const dx = (rx * side * 2 + (asym[row % asym.length] ?? 0) * side * 0.4 + rb * side * (t * 2 - 1))
        * WARP_LIMIT * anchored;
      const dy = (ry * (t - 0.5) * 2 + rb * (t > 0.6 ? 1 : 0) * 0.5)
        * WARP_LIMIT * anchored;
      out.push([clamp(dx, -WARP_LIMIT, WARP_LIMIT), clamp(dy, -WARP_LIMIT, WARP_LIMIT)]);
    }
  }
  return out;
}

/** Deterministic, total, and free of any lookup. Same descriptor in, same
 *  selection out, forever -- which is what makes a portrait cacheable on the
 *  descriptor key. */
export function selectLayers(d: AvatarRenderDescriptor): PortraitSelection {
  const shaved = d.hair.length === 'none' || d.hair.styleId.startsWith('bald');
  const stubbleOnly = d.facialHair.styleId === 'none' || d.facialHair.styleId === 'clean';

  return {
    structure: structureFamily(d.geometry),
    ageBand: ageBandFor(d.age.years),
    pigment: {
      targetStep: Math.round(d.colour.pigment * 35),
      undertone: d.colour.undertone,
      hex: d.colour.skin,
    },
    hairStyleId: d.bare || shaved ? null : d.hair.styleId,
    hairFamily: d.hair.family,
    hairHex: d.colour.hair,
    greying: d.hair.greying,
    facialHairId: d.bare || stubbleOnly ? null : d.facialHair.styleId,
    facialHairHex: d.colour.brow,
    facialHairStrength: d.facialHair.density,
    complexionId: d.complexion === 'none' ? null : d.complexion,
    ageOverlayStrength: d.age.wear,
    accessoryId: d.accessory === 'none' ? null : d.accessory,
    buildId: buildBand(d.body),
    warp: warpGrid(d.geometry),
  };
}

/** Shoulders come in authored widths, so the continuous build has to land on
 *  one. Five bands, named for what they are rather than for a position, since
 *  a wide-bodied receiver and a light guard share a silhouette. */
function buildBand(body: AvatarRenderDescriptor['body']): string {
  const v = (body.shoulders * 2 + body.neck + body.traps) / 4;
  const bands = ['slight', 'lean', 'median', 'heavy', 'massive'] as const;
  return bands[bucket(v, bands.length)] ?? 'median';
}
