// The renderer that ships.
//
// Code-generated layered vector portraiture: a backdrop, shoulders, a neck, a
// head built from the player's own geometry, features, hair, and whatever he
// is wearing. Stated plainly because it matters to expectations -- this is not
// the photoreal look of a reference photograph, and it cannot be. There are no
// image files anywhere in this project, no asset pipeline to add them to, and
// docs/IP-POLICY.md forbids the only cheap source of photoreal faces. What can
// be built honestly today is this, and portrait.ts is the seam that lets a
// better renderer replace it later without touching identity.
//
// Layer order is the whole trick, and it is the order a face is actually
// built: ground, body, ears, skull, modelling, features, hair over the
// hairline, facial hair over the jaw, worn items last.

import type { ReactNode } from 'react';
import type { PortraitRenderer, PortraitRequest } from './portrait';
import { DETAIL_FLOOR, PORTRAIT_PX } from './portrait';
import { faceGeometry, facePath } from './geometry';
import { brows, ears, eyes, modelling, mouth, nose, palette } from './svgFeatures';
import { accessory, facialHair, hair } from './svgHair';
import { skinColor, shadeSkin } from '../../supabase/functions/_shared/avatar/skin';
import { HAIR_COLORS } from '../../supabase/functions/_shared/avatar/hair';
import { EYE_COLORS } from '../../supabase/functions/_shared/avatar/traits';
import { COLOR } from '../app/tokens';

/** Eye colours as hex. The trait library stores names, because a name is what
 *  a commissioner edits and what the lab prints; the mapping to pixels belongs
 *  to a renderer and lives here. */
const EYE_HEX: Readonly<Record<string, string>> = {
  'dark-brown': '#3B2417', brown: '#5A3A22', 'light-brown': '#7C5530',
  hazel: '#7A6435', amber: '#9A6B25', green: '#4F6B45',
  blue: '#5A7E96', 'grey-blue': '#6C8394', grey: '#77807F',
  // Two colours, and the renderer draws the first. Recorded honestly rather
  // than averaged into a colour neither eye is.
  heterochromic: '#5A3A22',
};

const eyeHex = (id: string): string =>
  EYE_HEX[id] ?? EYE_HEX[EYE_COLORS[0]?.id ?? 'dark-brown'] ?? '#3B2417';

const hairHex = (id: string): string =>
  HAIR_COLORS.find((c) => c.id === id)?.hex ?? '#14100e';

/**
 * The ground behind the head.
 *
 * The club's two colours when there is a club, washed well down: a portrait
 * on a saturated team colour is a badge with a face on it, and these sit in
 * lists next to each other where that would be unreadable. A player with no
 * club gets the app's own panel colour rather than somebody else's.
 */
function backdrop(primary: string | undefined, secondary: string | undefined, id: string): ReactNode {
  if (primary === undefined || secondary === undefined) {
    return <rect x={0} y={0} width={100} height={100} fill={COLOR.raise} />;
  }
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={primary} stopOpacity={0.5} />
          <stop offset="100%" stopColor={secondary} stopOpacity={0.32} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={100} height={100} fill={COLOR.ink} />
      <rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
    </>
  );
}

function Portrait({ profile, size, primary, secondary, label }: PortraitRequest) {
  const px = PORTRAIT_PX[size];
  const detail = px >= DETAIL_FLOOR;
  const g = faceGeometry(profile);
  const px2 = (n: number): string => n.toFixed(2);
  const i = profile.identity;
  const a = profile.appearance;

  const skin = skinColor(i.skinStep, i.undertone);
  const p = palette(skin, hairHex(a.hairColor), eyeHex(i.eyeColor));
  const hairLayers = hair(g, p, a.hairstyle, i.hairTexture, detail);

  // Unique per portrait instance: two portraits on one screen sharing a defs
  // id would share a clip, and the second face would wear the first one's
  // beard.
  const uid = `av-${profile.seed}-${size}`;

  return (
    <svg
      viewBox="0 0 100 100" width={px} height={px} role="img" aria-label={label}
      style={{ display: 'block', borderRadius: Math.max(6, Math.round(px * 0.24)) }}
    >
      {backdrop(primary, secondary, `${uid}-bg`)}
      <defs>
        <clipPath id={`${uid}-face`}>
          <path d={facePath(g)} />
        </clipPath>
      </defs>

      {hairLayers.back}

      {/* The neck, then the shoulders over it: a collar that met the neck edge
          to edge would leave a seam at every build, and the body is in front
          of the neck on a real person anyway. */}
      <rect
        x={g.cx - g.neckW} y={g.neckY} width={g.neckW * 2} height={100 - g.neckY}
        fill={p.deep} rx={g.neckW * 0.35}
      />
      <path
        d={`M ${px2(g.cx - g.shoulderW)} 100`
          + ` C ${px2(g.cx - g.shoulderW * 0.99)} ${px2(g.shoulderY + 6)} ${px2(g.cx - g.shoulderW * 0.6)} ${px2(g.shoulderY - 1)} ${px2(g.cx - g.neckW * 1.15)} ${px2(g.shoulderY + 1)}`
          + ` L ${px2(g.cx + g.neckW * 1.15)} ${px2(g.shoulderY + 1)}`
          + ` C ${px2(g.cx + g.shoulderW * 0.6)} ${px2(g.shoulderY - 1)} ${px2(g.cx + g.shoulderW * 0.99)} ${px2(g.shoulderY + 6)} ${px2(g.cx + g.shoulderW)} 100 Z`}
        fill={primary ?? COLOR.line}
      />
      {/* A darker yoke, so shoulders read as a body rather than as a block of
          team colour with a head balanced on it. */}
      <path
        d={`M ${px2(g.cx - g.neckW * 1.05)} ${px2(g.shoulderY - 1)}`
          + ` Q ${px2(g.cx)} ${px2(g.shoulderY + 7)} ${px2(g.cx + g.neckW * 1.05)} ${px2(g.shoulderY - 1)}`
          + ` Q ${px2(g.cx)} ${px2(g.shoulderY + 2)} ${px2(g.cx - g.neckW * 1.05)} ${px2(g.shoulderY - 1)} Z`}
        fill={secondary ?? COLOR.line2}
        opacity={0.75}
      />

      {ears(g, p)}
      <path d={facePath(g)} fill={p.skin} />
      <g clipPath={`url(#${uid}-face)`}>
        {detail && modelling(g, p, a.ageWear)}
        {brows(g, p)}
        {eyes(g, p, detail)}
        {nose(g, p, detail)}
        {i.complexion !== 'none' && detail && complexion(g, p, i.complexion)}
      </g>
      {facialHair(g, p, a.facialHair, a.facialHairDensity, `${uid}-face`)}
      {/* The mouth last of the face, over the beard. A beard drawn on top of
          the lips is a balaclava, which is what the first version rendered. */}
      <g clipPath={`url(#${uid}-face)`}>{mouth(g, p, a.expression)}</g>
      {hairLayers.front}
      {accessory(g, a.accessory)}
    </svg>
  );
}

/**
 * Complexion detail, only at a size it would read at.
 *
 * Twenty-two options and six marks between them: the rest are recorded on the
 * profile and are not drawn, because a freckle pattern and a "very even"
 * complexion are not distinguishable at 160px and pretending otherwise adds
 * noise rather than identity.
 */
function complexion(g: ReturnType<typeof faceGeometry>, p: ReturnType<typeof palette>, id: string): ReactNode {
  const dot = (x: number, y: number, r: number): ReactNode =>
    <circle key={`${String(x)}-${String(y)}`} cx={x} cy={y} r={r} fill={shadeSkin(p.skin, -0.3)} opacity={0.7} />;
  if (id.startsWith('freckles')) {
    const heavy = id.includes('heavy');
    const spots: ReactNode[] = [];
    for (let k = 0; k < (heavy ? 22 : 12); k += 1) {
      const side = k % 2 === 0 ? -1 : 1;
      const fx = g.cx + side * (g.cheekW * 0.3 + ((k * 37) % 100) / 100 * g.cheekW * 0.5);
      const fy = g.cheekY - 2 + ((k * 53) % 100) / 100 * g.headH * 0.14;
      spots.push(dot(fx, fy, 0.32));
    }
    return <g opacity={0.65}>{spots}</g>;
  }
  if (id === 'mole-cheek') return dot(g.cx - g.cheekW * 0.5, g.cheekY + 1, 0.55);
  if (id === 'mole-lip') return dot(g.cx + g.mouthW * 0.9, g.mouthY - 1.5, 0.45);
  if (id === 'mole-brow') return dot(g.cx + g.browW * 1.1, g.browY - 2, 0.45);
  if (id === 'scar-brow') {
    return <path d={`M ${(g.cx - g.browW * 1.2).toFixed(2)} ${(g.browY - 2.5).toFixed(2)} l 2 2.4`}
      stroke={shadeSkin(p.skin, 0.12)} strokeWidth={0.5} fill="none" strokeLinecap="round" />;
  }
  if (id === 'dimples') {
    return (
      <g opacity={0.5} stroke={p.shadow} strokeWidth={0.5} fill="none" strokeLinecap="round">
        <path d={`M ${(g.cx - g.mouthW * 1.35).toFixed(2)} ${(g.mouthY - 1).toFixed(2)} q -0.4 1.4 0.2 2.4`} />
        <path d={`M ${(g.cx + g.mouthW * 1.35).toFixed(2)} ${(g.mouthY - 1).toFixed(2)} q 0.4 1.4 -0.2 2.4`} />
      </g>
    );
  }
  return null;
}

/**
 * The shipped renderer.
 *
 * Returns null only if the geometry comes out unusable -- a profile whose
 * traits produced a head with no width, which should be impossible and is
 * checked anyway, because the alternative to checking is a screen full of
 * invisible players and no clue why.
 */
export const svgPortraitRenderer: PortraitRenderer = {
  id: 'svg-v1',
  label: 'Generated vector portrait',
  render: (request) => {
    const g = faceGeometry(request.profile);
    if (!(g.headW > 4) || !(g.headH > 4)) return null;
    return <Portrait {...request} />;
  },
};
