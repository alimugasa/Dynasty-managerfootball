// What colour the surface is, before any light hits it.
//
// Kept strictly apart from shading, which is the discipline that makes the
// whole thing hold together: albedo says "this is lip", never "this lip is in
// shadow". If a dark mark belongs here it is pigment; if it belongs in the
// shader it is light. V1 mixed the two constantly, which is why its faces were
// lit from several directions at once.

import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import type { Layout } from './field';
import type { AvatarRenderDescriptor } from './descriptor';

export interface Rgb { r: number; g: number; b: number }

export const hexRgb = (hex: string): Rgb => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

const EYE_HEX: Readonly<Record<string, string>> = {
  'dark-brown': '#4a3020', brown: '#6b4526', 'light-brown': '#8a6234',
  hazel: '#7d6c3e', amber: '#a5762e', green: '#546f4a',
  blue: '#66889f', 'grey-blue': '#78909f', grey: '#828a88',
  heterochromic: '#6b4526',
};

export interface Albedo {
  readonly colour: Rgb;
  /** 0-1. Lips and the brow are smoother than cheeks; hair is rougher. */
  readonly roughness: number;
  /** Eyes get their own specular and no subsurface. */
  readonly wet: boolean;
}

/**
 * The albedo at a point.
 *
 * Deliberately short. Almost everything a face shows is the light; the colour
 * map underneath is skin, lips, brows, eyes and a handful of markings, and
 * trying to put more into it is how you end up painting shadows again.
 */
export function albedoAt(
  d: AvatarRenderDescriptor, l: Layout, m: FaceMorph, x: number, y: number,
): Albedo {
  const skin = hexRgb(d.colour.skin);
  const h = l.chinY - l.crownY;
  const dx = x - l.cx;
  const adx = Math.abs(dx);

  // Skin is not one colour. Foreheads run cooler, the midface warmer where it
  // is thin over cartilage, the jaw cooler again. It is subtle and it is most
  // of why real skin does not look printed.
  const zone = (y - l.crownY) / h;
  let colour = skin;
  colour = mix(colour, { r: skin.r * 0.97, g: skin.g * 0.99, b: skin.b * 1.04 },
    Math.max(0, 1 - Math.abs(zone - 0.30) * 5) * 0.35);
  colour = mix(colour, { r: Math.min(255, skin.r * 1.06), g: skin.g * 0.98, b: skin.b * 0.95 },
    Math.max(0, 1 - Math.abs(zone - 0.62) * 4) * 0.40);
  colour = mix(colour, { r: skin.r * 0.98, g: skin.g * 0.99, b: skin.b * 1.02 },
    Math.max(0, 1 - Math.abs(zone - 0.92) * 5) * 0.25);

  // The nose and the ears are thin and let blood through.
  const tip = 1 - Math.min(1, Math.hypot(dx / (h * 0.05), (y - l.noseTipY) / (h * 0.045)));
  if (tip > 0) colour = mix(colour, { r: 196, g: 108, b: 92 }, tip * 0.16);

  // Lips.
  const mw = h * (0.098 + m.mouthWidth * 0.024);
  const upH = h * (0.016 + m.upperLip * 0.010);
  const loH = h * (0.020 + m.lowerLip * 0.012);
  const mx = dx - m.asymMouth * 0.003;
  const lipT = Math.max(
    1 - Math.hypot(mx / mw, (y - (l.mouthY - upH * 0.5)) / (upH * 1.05)),
    1 - Math.hypot(mx / (mw * 0.92), (y - (l.mouthY + loH * 0.6)) / (loH * 1.05)),
  );
  if (lipT > 0) {
    const lip = mix(colour, { r: 158, g: 86, b: 80 }, 0.52 - d.colour.pigment * -0.05);
    colour = mix(colour, lip, Math.min(1, lipT * 3.2));
  }

  // Brows: pigment, not a drawn stroke. The shape comes from the height field
  // and this only says where the hair is.
  const browColour = hexRgb(d.colour.brow);
  for (const s of [-1, 1]) {
    const bx = dx - s * l.eyeGap;
    const lift = h * (0.044 + m.browHeight * 0.020) + s * m.asymBrow * h * 0.005;
    const arch = -m.browCurve * h * 0.012 * Math.sin(Math.min(1, Math.max(0,
      (bx * s + l.eyeW) / (l.eyeW * 2))) * Math.PI);
    const t = 1 - Math.hypot(
      bx / (l.eyeW * (1.12 + m.browLength * 0.16)),
      (y - (l.browY - lift + arch)) / (h * (0.010 + m.browThickness * 0.006)),
    );
    if (t > 0) colour = mix(colour, browColour, Math.min(0.94, t * 2.6));
  }

  // Eyes: sclera, iris, pupil, and a limbal ring. Everything else about an eye
  // -- the lid over it, the socket behind it -- is geometry.
  for (const s of [-1, 1]) {
    const ex = dx - s * l.eyeGap;
    const tilt = m.eyeAngle * h * 0.010 * s;
    const ey = y - (l.eyeY + tilt * (ex * s > 0 ? -1 : 0.3)) - s * m.asymEye * h * 0.004;
    const open = 1 - Math.hypot(ex / l.eyeW, ey / l.eyeH);
    if (open <= 0) continue;
    const sclera = mix({ r: 232, g: 228, b: 222 }, skin, 0.10);
    colour = mix(colour, sclera, Math.min(1, open * 4));
    const ir = l.eyeW * 0.42;
    const id = Math.hypot(ex, (ey - l.eyeH * 0.10) * 1.0);
    if (id < ir) {
      const iris = hexRgb(EYE_HEX[d.colour.eye] ?? EYE_HEX['dark-brown'] ?? '#4a3020');
      const edge = Math.min(1, (ir - id) / (ir * 0.12));
      // Darker at the limbus, lighter toward the pupil.
      const shaded = mix(
        { r: iris.r * 0.55, g: iris.g * 0.55, b: iris.b * 0.55 },
        { r: Math.min(255, iris.r * 1.25), g: Math.min(255, iris.g * 1.2), b: Math.min(255, iris.b * 1.2) },
        Math.min(1, (ir - id) / ir),
      );
      colour = mix(colour, shaded, edge);
      if (id < ir * 0.42) colour = mix(colour, { r: 16, g: 12, b: 10 }, 0.94);
      return { colour, roughness: 1, wet: true };
    }
    return { colour, roughness: 0.85, wet: true };
  }

  // Markings.
  if (d.complexion.startsWith('freckles')) {
    const n = Math.sin(x * 431.7 + y * 197.3) * 43758.5453;
    const f = n - Math.floor(n);
    const zoneT = Math.max(0, 1 - Math.abs(zone - 0.60) * 3.4) * Math.max(0, 1 - adx / (l.zygW * 1.1));
    if (f > (d.complexion.includes('heavy') ? 0.86 : 0.94) && zoneT > 0.2) {
      colour = mix(colour, { r: colour.r * 0.72, g: colour.g * 0.62, b: colour.b * 0.58 }, 0.55);
    }
  }

  // Fine grain, so skin is not a flat field. Deterministic, and tiny.
  const g = Math.sin(x * 911.3 + y * 733.1) * 12345.678;
  const grain = ((g - Math.floor(g)) - 0.5) * 6;
  colour = { r: colour.r + grain, g: colour.g + grain, b: colour.b + grain };

  return { colour, roughness: 0.28 + d.age.wear * 0.12, wet: false };
}
