// Colour, derived rather than listed.
//
// An illustrated portrait needs about eight colours per player and they all
// have to agree with each other: a shadow that is merely "the skin, darker"
// goes muddy at the deep end of the scale and goes grey at the light end, and
// the previous renderer's olive undertones turned visibly green because the
// darkening dropped blue faster than red.
//
// So shading happens in HSL, where lightness moves on its own axis, with two
// deliberate hue rotations that illustrators make by hand: shadows turn a few
// degrees toward red, light turns a few degrees toward yellow. That is what
// keeps a deep olive complexion olive instead of khaki.
//
// The pigmentation scale itself is not redefined here. It is the existing
// 36-step scale in _shared/avatar/skin.ts, crossed with four undertones, and
// this file only shades what that returns.

import { clamp } from './geom';

interface Hsl { h: number; s: number; l: number }

function toHsl(hex: string): Hsl {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r
    ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function toHex({ h, s, l }: Hsl): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(hh / 60) % 6;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg] as number[];
  return `#${rgb
    .map((v) => Math.round(clamp((v + m) * 255, 0, 255)).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Shade a skin colour.
 *
 * `amount` is negative to darken. Saturation rises into shadow and falls into
 * light, which is how skin actually behaves and is also what stops a light
 * complexion's highlight going chalk-white.
 */
export function shade(hex: string, amount: number): string {
  const c = toHsl(hex);
  const dark = amount < 0;
  return toHex({
    h: c.h + (dark ? -5 : 4) * Math.abs(amount) * 2,
    // A modest saturation lift into shadow. The first version used half again
    // and capped at 0.85, which turned every light complexion's shadow orange
    // -- and the neck, being mostly shadow, turned orange with it.
    s: clamp(c.s * (dark ? 1 + Math.abs(amount) * 0.22 : 1 - Math.abs(amount) * 0.45), 0, 0.58),
    l: clamp(c.l + amount * (dark ? c.l : 1 - c.l) * 1.05, 0.03, 0.97),
  });
}

export interface SkinPalette {
  readonly base: string;
  /** The broad form shadow: temple, under-cheek, jaw. */
  readonly soft: string;
  /** The occluded core: eye socket, under the nose, under the lip. */
  readonly deep: string;
  /** Forehead, nose bridge, cheekbone. */
  readonly light: string;
  /** Feature lines -- lid creases, the mouth line, the ear's inner fold. Never
   *  black: a black line on a deep complexion reads as a gap in the drawing. */
  readonly line: string;
  /** The silhouette edge. Darker than `line` and used at low width, which is
   *  what gives an illustration its weight without an outline around it. */
  readonly edge: string;
  readonly lip: string;
  readonly lipShadow: string;
}

/**
 * Everything a face needs, from one hex and its position on the scale.
 *
 * `pigment` is 0 at the deepest step and 1 at the lightest. It exists because
 * contrast does not behave the same way along the scale: a deep complexion
 * separates its planes with light, a light one separates them with shadow, and
 * a fixed pair of offsets makes one of the two look flat.
 */
export function skinPalette(hex: string, pigment: number): SkinPalette {
  const p = clamp(pigment, 0, 1);
  // A shared warm illustration light, applied after identity pigmentation.
  // Preserve lightness and the ordering of undertones; avoid grey/green casts
  // from the neutral swatches in a dark portrait surround.
  const swatch = toHsl(hex);
  hex = toHex({ h: swatch.h + (24 - swatch.h) * 0.35,
    s: clamp(swatch.s * 1.12 + 0.04, 0, 0.65), l: swatch.l });
  const shadowPull = 0.26 + p * 0.14;
  const lightPull = 0.14 - p * 0.07;
  const lip = toHsl(hex);
  return {
    base: hex,
    soft: shade(hex, -shadowPull * 0.55),
    deep: shade(hex, -shadowPull),
    light: shade(hex, lightPull),
    line: shade(hex, -(0.42 + p * 0.16)),
    edge: shade(hex, -(0.55 + p * 0.14)),
    // Lips need to separate from the skin or the mouth vanishes at portrait
    // size, and they separate by being darker and a touch more saturated --
    // never by being pink, which is the doll tell.
    lip: toHex({ h: lip.h - 7, s: lip.s * 0.90, l: lip.l * 0.86 }),
    lipShadow: shade(hex, -(0.36 + p * 0.12)),
  };
}

/** Hair needs the same treatment and a different curve: a highlight on black
 *  hair is a lift in lightness, not a wash toward grey. */
export interface HairPalette {
  readonly base: string;
  readonly shadow: string;
  readonly light: string;
  readonly edge: string;
}

export function hairPalette(hex: string): HairPalette {
  const l = toHsl(hex).l;
  const lift = l < 0.25 ? 0.30 : l < 0.5 ? 0.22 : 0.14;
  return {
    base: hex,
    shadow: shade(hex, -0.28),
    light: shade(hex, lift),
    edge: shade(hex, -0.42),
  };
}
