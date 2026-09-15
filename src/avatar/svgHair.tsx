// Hair, facial hair and the things a player puts on.
//
// Sixty-odd hairstyles and twenty-six facial-hair styles do not become sixty
// and twenty-six hand-drawn shapes here. They become a small number of drawn
// forms -- a cap of hair, a volume above the hairline, a beard mask -- driven
// by the properties the library already records: how long the style is, what
// texture it is worn in, and the keywords in its name. That is the same bridge
// geometry.ts uses, for the same reason, and with the same honest limit: two
// short fades differ here by texture and a hash rather than by silhouette.
//
// What the library's structure does buy, and this file spends: a style is only
// ever drawn in a texture it is actually worn in, because generate.ts never
// pairs them otherwise.

import type { ReactNode } from 'react';
import type { Geometry } from './geometry';
import type { Palette } from './svgFeatures';
import { hashTrait } from './geometry';
import { HAIRSTYLES, textureFamily } from '../../supabase/functions/_shared/avatar/hair';

const px = (n: number): string => n.toFixed(2);

const lengthOf = (styleId: string): 'none' | 'short' | 'medium' | 'long' =>
  HAIRSTYLES.find((h) => h.id === styleId)?.length ?? 'short';

/**
 * How far the hair stands off the skull.
 *
 * Texture first, because it is the thing that actually decides: coily hair at
 * two inches occupies a different silhouette from straight hair at two inches,
 * and a renderer that only reads length draws every player in the same wig.
 */
function volume(styleId: string, texture: string): number {
  const family = textureFamily(texture);
  const byFamily = { straight: 0.6, wavy: 1, curly: 1.5, coily: 2.1 }[family];
  const byLength = { none: 0, short: 0.7, medium: 1.5, long: 2.4 }[lengthOf(styleId)];
  const named = (styleId.includes('afro') ? 1.8 : 0)
    + (styleId.includes('locs') || styleId.includes('braid') || styleId.includes('twist') ? 0.5 : 0)
    + (styleId.includes('fade') || styleId.includes('buzz') || styleId.includes('crew') ? -0.4 : 0);
  return Math.max(0, byFamily * byLength + named);
}

/**
 * The hair itself.
 *
 * Drawn as a shape that follows the skull and is cut off at the hairline,
 * which is what makes recession visible: nothing here knows about balding, it
 * simply draws down to wherever geometry.ts put the hairline, and age moved
 * that.
 */
export interface HairLayers {
  /** Length that falls behind the head. Drawn before the face, so the outline
   *  covers whatever crosses it -- which is what stops a medium cut reading as
   *  a hood pulled down over the eyes. */
  readonly back: ReactNode;
  readonly front: ReactNode;
}

export function hair(
  g: Geometry, p: Palette, styleId: string, texture: string, detail: boolean,
): HairLayers {
  if (lengthOf(styleId) === 'none') {
    const shaved = (
    // A shaved head is not "no hair": it is a shadow on the skull, and drawing
    // nothing at all makes every bald player look like a mannequin.
      <path
        d={`M ${px(g.cx - g.templeW * 0.96)} ${px(g.hairlineY + 1)}`
          + ` Q ${px(g.cx)} ${px(g.crownY - 0.5)} ${px(g.cx + g.templeW * 0.96)} ${px(g.hairlineY + 1)}`
          + ` Q ${px(g.cx)} ${px(g.hairlineY + 4)} ${px(g.cx - g.templeW * 0.96)} ${px(g.hairlineY + 1)} Z`}
        fill={p.hairShade}
        opacity={styleId === 'bald' ? 0.1 : 0.28}
      />
    );
    return { back: null, front: shaved };
  }

  const v = volume(styleId, texture);
  const top = g.crownY - v * 1.5;
  const wide = g.templeW * (1 + v * 0.09);
  const peak = styleId.includes('widow') || g.hairlineY < g.crownY + g.headH * 0.1;
  const dip = peak ? 2.2 : 0.6;

  const cap = `M ${px(g.cx - wide)} ${px(g.hairlineY + 3)}`
    + ` C ${px(g.cx - wide - v * 0.6)} ${px(top + g.headH * 0.12)} ${px(g.cx - wide * 0.55)} ${px(top)} ${px(g.cx)} ${px(top)}`
    + ` C ${px(g.cx + wide * 0.55)} ${px(top)} ${px(g.cx + wide + v * 0.6)} ${px(top + g.headH * 0.12)} ${px(g.cx + wide)} ${px(g.hairlineY + 3)}`
    + ` Q ${px(g.cx + g.templeW * 0.5)} ${px(g.hairlineY - 0.4)} ${px(g.cx)} ${px(g.hairlineY + dip)}`
    + ` Q ${px(g.cx - g.templeW * 0.5)} ${px(g.hairlineY - 0.4)} ${px(g.cx - wide)} ${px(g.hairlineY + 3)} Z`;

  // Length that falls past the ear, for the styles that have it. Drawn as the
  // back layer and therefore only visible where it clears the head.
  const fall = lengthOf(styleId) === 'long' ? g.headH * 0.5
    : lengthOf(styleId) === 'medium' ? g.headH * 0.16 : 0;

  const back = fall <= 0 ? null : (
    <path
      d={`M ${px(g.cx - wide * 1.02)} ${px(g.hairlineY + 2)}`
        + ` Q ${px(g.cx - wide * 1.14)} ${px(g.earY + fall)} ${px(g.cx - wide * 0.55)} ${px(g.earY + fall)}`
        + ` L ${px(g.cx + wide * 0.55)} ${px(g.earY + fall)}`
        + ` Q ${px(g.cx + wide * 1.14)} ${px(g.earY + fall)} ${px(g.cx + wide * 1.02)} ${px(g.hairlineY + 2)} Z`}
      fill={p.hairShade}
    />
  );

  const front = (
    <g>
      <path d={cap} fill={p.hair} />
      {detail && v > 0.9 && (
        // Texture, as a few strokes following the crown rather than as a
        // pattern fill: a repeating texture at 160px reads as fabric.
        <g opacity={0.3} stroke={p.hairShade} strokeWidth={0.5} fill="none" strokeLinecap="round">
          {[-0.55, -0.2, 0.2, 0.55].map((f) => (
            <path
              key={f}
              d={`M ${px(g.cx + wide * f)} ${px(g.hairlineY + 2)} Q ${px(g.cx + wide * f * 1.3)} ${px(top + 3)} ${px(g.cx + wide * f * 0.5)} ${px(top + 1)}`}
            />
          ))}
        </g>
      )}
    </g>
  );
  return { back, front };
}

/** How much of the lower face a style covers, as a fraction from the jaw up. */
function beardReach(id: string): number {
  if (id === 'clean') return 0;
  if (id.startsWith('stubble')) return 0.85;
  if (id.startsWith('beard')) return id.includes('short') ? 0.9 : 1;
  if (id.includes('goatee') || id.includes('chin') || id.includes('anchor')
    || id.includes('van-dyke') || id.includes('balbo')) return 0.35;
  if (id === 'soul-patch') return 0.12;
  if (id.startsWith('mustache')) return 0;
  if (id.startsWith('sideburns')) return 0.2;
  if (id === 'horseshoe') return 0.4;
  return 0.6;
}

const DENSITY_ALPHA: Readonly<Record<string, number>> = {
  sparse: 0.34, light: 0.5, medium: 0.68, thick: 0.82, dense: 0.94,
};

/**
 * Facial hair, as a mask over the lower face clipped to the jaw.
 *
 * Clipped rather than drawn to a shape of its own, so a beard follows the
 * face it is on: a wide jaw gets a wide beard without a second table saying
 * so, and a beard can never hang off the side of a narrow one.
 */
export function facialHair(
  g: Geometry, p: Palette, id: string, density: string, clipId: string,
): ReactNode {
  if (id === 'clean') return null;
  const alpha = DENSITY_ALPHA[density] ?? 0.68;
  const reach = beardReach(id);
  const stubble = id.startsWith('stubble');
  // Measured between two anchors a beard actually sits between: a full one
  // starts just under the nose, a goatee just under the lower lip. The first
  // version measured up from the cheekbone, which put heavy stubble above the
  // nose and made every bearded player look masked.
  const high = g.noseY + g.noseH * 0.45;
  const low = g.mouthY + g.lipLower + 1.5;
  const top = low + (high - low) * reach;
  const wide = g.cheekW * 1.02;

  return (
    <g clipPath={`url(#${clipId})`} opacity={stubble ? alpha * 0.55 : alpha}>
      {reach > 0 && (
        <path
          d={`M ${px(g.cx - wide)} ${px(top)} L ${px(g.cx + wide)} ${px(top)}`
            + ` L ${px(g.cx + wide)} ${px(g.chinY + 4)} L ${px(g.cx - wide)} ${px(g.chinY + 4)} Z`}
          fill={p.hairShade}
        />
      )}
      {(id.startsWith('mustache') || id === 'horseshoe' || id === 'van-dyke'
        || id === 'goatee-circle' || id === 'balbo' || id.startsWith('beard')) && (
        <path
          d={`M ${px(g.cx - g.mouthW * 1.15)} ${px(g.mouthY - g.lipUpper * 0.6)}`
            + ` Q ${px(g.cx)} ${px(g.mouthY - g.lipUpper * 1.7 - (id === 'mustache-thick' ? 1 : 0))} ${px(g.cx + g.mouthW * 1.15)} ${px(g.mouthY - g.lipUpper * 0.6)}`
            + ` Q ${px(g.cx)} ${px(g.mouthY - g.lipUpper * 0.4)} ${px(g.cx - g.mouthW * 1.15)} ${px(g.mouthY - g.lipUpper * 0.6)} Z`}
          fill={p.hairShade}
        />
      )}
      {id === 'beard-patchy' && (
        // Patchy is the one style the mask alone cannot say: it is defined by
        // where the hair is not.
        <g fill={p.skin} opacity={0.55}>
          {[0.3, -0.45, 0.62].map((f) => (
            <ellipse key={f} cx={g.cx + g.cheekW * f} cy={g.jawY - Math.abs(f) * 2}
              rx={g.headW * (0.08 + hashTrait(`${id}${String(f)}`) * 0.05)} ry={g.headH * 0.05} />
          ))}
        </g>
      )}
    </g>
  );
}

/** Worn, not grown. Only the ones that read at portrait scale are drawn; the
 *  rest are recorded on the profile and simply have no mark on the face. */
export function accessory(g: Geometry, id: string): ReactNode {
  if (id === 'eye-black') {
    return (
      <g fill="#1A1410" opacity={0.85}>
        <rect x={g.cx - g.eyeGap - g.eyeW * 0.8} y={g.eyeY + g.eyeH * 2.1} width={g.eyeW * 1.6} height={1.5} rx={0.5} />
        <rect x={g.cx + g.eyeGap - g.eyeW * 0.8} y={g.eyeY + g.eyeH * 2.1} width={g.eyeW * 1.6} height={1.5} rx={0.5} />
      </g>
    );
  }
  if (id === 'headband') {
    return (
      <path
        d={`M ${px(g.cx - g.templeW * 1.02)} ${px(g.hairlineY + 1)} Q ${px(g.cx)} ${px(g.hairlineY - 2.4)} ${px(g.cx + g.templeW * 1.02)} ${px(g.hairlineY + 1)}`}
        fill="none" stroke="#DCE3EA" strokeWidth={3} strokeLinecap="round" opacity={0.9}
      />
    );
  }
  if (id === 'skull-cap') {
    return (
      <path
        d={`M ${px(g.cx - g.templeW)} ${px(g.hairlineY + 3)} Q ${px(g.cx)} ${px(g.crownY - 2)} ${px(g.cx + g.templeW)} ${px(g.hairlineY + 3)} Z`}
        fill="#20282F"
      />
    );
  }
  if (id === 'earrings') {
    return (
      <g fill="#D9C27A">
        <circle cx={g.cx - g.cheekW + 0.2} cy={g.earY + g.earH * 0.46} r={0.9} />
        <circle cx={g.cx + g.cheekW - 0.2} cy={g.earY + g.earH * 0.46} r={0.9} />
      </g>
    );
  }
  if (id === 'nose-stud') {
    return <circle cx={g.cx - g.noseW * 0.85} cy={g.noseY + g.noseH * 0.3} r={0.55} fill="#D9C27A" />;
  }
  if (id === 'tape-bridge') {
    return (
      <rect x={g.cx - g.noseW * 0.7} y={g.noseY - g.noseH * 0.4} width={g.noseW * 1.4} height={2.2}
        rx={1} fill="#E9E4DC" opacity={0.9} transform={`rotate(-2 ${px(g.cx)} ${px(g.noseY)})`} />
    );
  }
  if (id === 'chain') {
    return (
      <path
        d={`M ${px(g.cx - g.neckW * 0.8)} ${px(g.shoulderY - 10)} Q ${px(g.cx)} ${px(g.shoulderY - 4)} ${px(g.cx + g.neckW * 0.8)} ${px(g.shoulderY - 10)}`}
        fill="none" stroke="#D9C27A" strokeWidth={1.1} opacity={0.9}
      />
    );
  }
  // 'none', and anything a future library adds that this renderer has no mark
  // for. Drawing nothing is correct; guessing is not.
  return null;
}
