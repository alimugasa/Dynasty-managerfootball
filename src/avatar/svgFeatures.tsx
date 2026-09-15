// The features, as paths.
//
// Split out of svgPortrait.tsx for the 400-line ceiling, and it is a clean cut
// in any case: this file draws things inside the face outline and knows
// nothing about hair, shoulders, backdrops or sizing. Every function here
// takes geometry and colours and returns SVG, and none of them reads a trait
// id -- the trait has already become a number by the time it arrives, which is
// what keeps geometry.ts the only place that interprets a name.

import type { ReactNode } from 'react';
import type { Geometry } from './geometry';
import { shadeSkin } from '../../supabase/functions/_shared/avatar/skin';

export interface Palette {
  readonly skin: string;
  readonly shadow: string;
  readonly deep: string;
  readonly light: string;
  readonly hair: string;
  readonly hairShade: string;
  readonly eye: string;
  readonly lip: string;
  readonly line: string;
}

/**
 * Everything the face is drawn in, from the two colours the profile stores.
 *
 * Derived rather than looked up so that a skin step between the named bands
 * still gets a shadow that belongs to it. `shadeSkin` moves a colour along its
 * own value rather than mixing it toward black, which is the difference
 * between shading and dirt.
 */
export function palette(skin: string, hairHex: string, eyeHex: string): Palette {
  return {
    skin,
    shadow: shadeSkin(skin, -0.12),
    deep: shadeSkin(skin, -0.24),
    light: shadeSkin(skin, 0.1),
    hair: hairHex,
    hairShade: shadeSkin(hairHex, -0.22),
    eye: eyeHex,
    // Lips take their colour from the skin rather than from a fixed red: a
    // single lip colour across thirty-six skin steps reads as makeup on most
    // of them.
    lip: shadeSkin(skin, -0.16),
    line: shadeSkin(skin, -0.34),
  };
}

const px = (n: number): string => n.toFixed(2);

/** One eye. Drawn as a lens rather than an ellipse -- an ellipse gives every
 *  player the same startled look, and the corners are most of what separates
 *  one eye shape from another. */
function eye(g: Geometry, side: 1 | -1, p: Palette, detail: boolean): ReactNode {
  const x = g.cx + side * g.eyeGap;
  const y = g.eyeY + side * g.eyeTilt * 0.25;
  const w = g.eyeW;
  const h = g.eyeH;
  const tilt = g.eyeTilt * 0.6;
  const lens = `M ${px(x - w)} ${px(y + tilt * side)}`
    + ` Q ${px(x)} ${px(y - h * 1.8 + tilt * side * 0.4)} ${px(x + w)} ${px(y - tilt * side)}`
    + ` Q ${px(x)} ${px(y + h * 1.7)} ${px(x - w)} ${px(y + tilt * side)} Z`;
  return (
    <g key={`eye${String(side)}`}>
      <path d={lens} fill="#F3EDE6" />
      <circle cx={x} cy={y + h * 0.1} r={Math.min(h * 1.15, w * 0.52)} fill={p.eye} />
      <circle cx={x} cy={y + h * 0.1} r={Math.min(h * 0.52, w * 0.24)} fill="#120C08" />
      {detail && (
        <circle cx={x - w * 0.16} cy={y - h * 0.3} r={Math.max(0.35, w * 0.12)} fill="#FFFFFF" opacity={0.85} />
      )}
      {/* The upper lid line. Without it the eye floats on the cheek. */}
      <path d={lens} fill="none" stroke={p.line} strokeWidth={detail ? 0.7 : 1} opacity={0.75} />
    </g>
  );
}

export function eyes(g: Geometry, p: Palette, detail: boolean): ReactNode {
  return <>{eye(g, -1, p, detail)}{eye(g, 1, p, detail)}</>;
}

export function brows(g: Geometry, p: Palette): ReactNode {
  const brow = (side: 1 | -1): ReactNode => {
    const x = g.cx + side * g.eyeGap;
    const y = g.browY + side * g.eyeTilt * 0.2;
    const w = g.browW;
    const arch = g.browArch;
    return (
      <path
        key={`brow${String(side)}`}
        d={`M ${px(x - w)} ${px(y + 0.5)} Q ${px(x)} ${px(y - 1 - arch)} ${px(x + w)} ${px(y - 0.2)}`}
        fill="none"
        stroke={p.hairShade}
        strokeWidth={g.browThick}
        strokeLinecap="round"
        opacity={0.92}
      />
    );
  };
  return <>{brow(-1)}{brow(1)}</>;
}

/**
 * The nose, as a bridge and a base.
 *
 * Only the shadow side of the bridge is drawn, not an outline: a nose with a
 * line down both sides reads as a mask, and one lit edge is how a nose
 * actually resolves at portrait scale.
 */
export function nose(g: Geometry, p: Palette, detail: boolean): ReactNode {
  const top = g.noseY - g.noseH * 0.62;
  const base = g.noseY + g.noseH * 0.38;
  const w = g.noseW;
  const bend = g.noseBridge * w * 0.5;
  return (
    <g>
      <path
        d={`M ${px(g.cx - w * 0.32)} ${px(top)}`
          + ` C ${px(g.cx - w * 0.5 - bend)} ${px((top + base) / 2)} ${px(g.cx - w * 0.75)} ${px(base - 1)} ${px(g.cx - w)} ${px(base)}`}
        fill="none" stroke={p.shadow} strokeWidth={detail ? 0.9 : 1.3} strokeLinecap="round" opacity={0.8}
      />
      {/* The base: two wings and the septum between them. */}
      <path
        d={`M ${px(g.cx - w)} ${px(base)} Q ${px(g.cx - w * 0.55)} ${px(base + 1.6)} ${px(g.cx)} ${px(base + 0.9)}`
          + ` Q ${px(g.cx + w * 0.55)} ${px(base + 1.6)} ${px(g.cx + w)} ${px(base)}`}
        fill="none" stroke={p.deep} strokeWidth={detail ? 0.85 : 1.2} strokeLinecap="round" opacity={0.85}
      />
      {detail && (
        <>
          <ellipse cx={g.cx - w * 0.62} cy={base + 0.2} rx={w * 0.2} ry={0.42} fill={p.deep} opacity={0.6} />
          <ellipse cx={g.cx + w * 0.62} cy={base + 0.2} rx={w * 0.2} ry={0.42} fill={p.deep} opacity={0.6} />
        </>
      )}
    </g>
  );
}

/** The mouth. The expression moves the corners and nothing else -- a smile
 *  drawn by redrawing the lips is a different mouth, which is a different
 *  person. */
export function mouth(g: Geometry, p: Palette, expression: string): ReactNode {
  const lift = expression === 'confident' ? 0.8
    : expression === 'relaxed' ? 0.5
      : expression === 'intense' ? -0.6 : 0;
  const w = g.mouthW;
  const y = g.mouthY;
  const upper = `M ${px(g.cx - w)} ${px(y + lift * 0.4)}`
    + ` Q ${px(g.cx - w * 0.45)} ${px(y - g.lipUpper * 0.55)} ${px(g.cx)} ${px(y - g.lipUpper * 0.18)}`
    + ` Q ${px(g.cx + w * 0.45)} ${px(y - g.lipUpper * 0.55)} ${px(g.cx + w)} ${px(y + lift * 0.4)}`;
  const lower = `${upper} Q ${px(g.cx)} ${px(y + g.lipLower)} ${px(g.cx - w)} ${px(y + lift * 0.4)} Z`;
  return (
    <g>
      <path d={lower} fill={p.lip} opacity={0.9} />
      <path
        d={upper} fill="none" stroke={p.line} strokeWidth={0.8}
        strokeLinecap="round" opacity={0.85}
      />
    </g>
  );
}

/** Ears, behind the hair in the stacking order and in front of the jaw. */
export function ears(g: Geometry, p: Palette): ReactNode {
  const ear = (side: 1 | -1): ReactNode => {
    // Set on the outside of the cheek rather than inside it. The first
    // version centred the ear on the face edge, so the face fill covered half
    // of it and every player looked earless.
    const x = g.cx + side * (g.cheekW + g.earH * 0.12 + g.earOut * 0.35);
    return (
      <ellipse
        key={`ear${String(side)}`}
        cx={x}
        cy={g.earY}
        rx={g.earH * 0.36 + g.earOut * 0.22}
        ry={g.earH * 0.52}
        fill={p.shadow}
        transform={`rotate(${px(side * -6)} ${px(x)} ${px(g.earY)})`}
      />
    );
  };
  return <>{ear(-1)}{ear(1)}</>;
}

/**
 * Cheekbones, the brow ridge, and what the years have done.
 *
 * All of it soft and low-opacity. Shading at this scale is the difference
 * between a face and a sticker, and shading that can be individually
 * identified is the difference between a face and a diagram.
 */
export function modelling(g: Geometry, p: Palette, wear: number): ReactNode {
  return (
    <g opacity={0.5}>
      <ellipse cx={g.cx - g.cheekW * 0.62} cy={g.cheekY + 1} rx={g.headW * 0.13} ry={g.headH * 0.1}
        fill={p.shadow} opacity={0.5} />
      <ellipse cx={g.cx + g.cheekW * 0.62} cy={g.cheekY + 1} rx={g.headW * 0.13} ry={g.headH * 0.1}
        fill={p.shadow} opacity={0.5} />
      {wear > 0.25 && (
        <>
          {/* Nasolabial folds and a brow line: the two that read first. */}
          <path d={`M ${px(g.cx - g.noseW * 1.05)} ${px(g.noseY + g.noseH * 0.4)} Q ${px(g.cx - g.mouthW * 1.25)} ${px(g.mouthY - 0.5)} ${px(g.cx - g.mouthW * 1.05)} ${px(g.mouthY + 1.2)}`}
            fill="none" stroke={p.shadow} strokeWidth={0.6} opacity={wear} strokeLinecap="round" />
          <path d={`M ${px(g.cx + g.noseW * 1.05)} ${px(g.noseY + g.noseH * 0.4)} Q ${px(g.cx + g.mouthW * 1.25)} ${px(g.mouthY - 0.5)} ${px(g.cx + g.mouthW * 1.05)} ${px(g.mouthY + 1.2)}`}
            fill="none" stroke={p.shadow} strokeWidth={0.6} opacity={wear} strokeLinecap="round" />
        </>
      )}
      {wear > 0.5 && (
        <path d={`M ${px(g.cx - g.browW * 0.9)} ${px(g.browY - 3)} Q ${px(g.cx)} ${px(g.browY - 4.2)} ${px(g.cx + g.browW * 0.9)} ${px(g.browY - 3)}`}
          fill="none" stroke={p.shadow} strokeWidth={0.5} opacity={(wear - 0.5) * 1.4} strokeLinecap="round" />
      )}
    </g>
  );
}
