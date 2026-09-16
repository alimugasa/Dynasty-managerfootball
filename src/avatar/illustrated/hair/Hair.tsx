// Hair, assembled.
//
// Three passes: the mass, the fade, the texture. The fade is a real gradient
// down to the skin colour rather than a shorter shape, because that is what a
// fade is -- hair thinning to nothing, not hair stopping -- and it is the
// single detail that separates a barbered head from a bowl of paint.
//
// Anything that falls below the ear line is drawn twice: once behind the head
// so it sits behind the shoulders, once in front so it frames the face. Long
// hair drawn only in front is the bug that put a player's own fringe over his
// forehead in the first renderer, and long hair drawn only behind disappears.

import { closedPath, pt } from '../geom';
import { hairPalette } from '../palette';
import type { DrawContext } from '../types';
import { hairOutline } from './outline';
import { HairTexture } from './texture';
import { hairStyle } from './styles';

interface HairProps {
  readonly ctx: DrawContext;
  readonly id: string;
  readonly recession: number;
  readonly greying: number;
}

/** Grey is a proportion of strands that lost their colour, so it blends toward
 *  a neutral rather than swapping for a different hex. */
function greyed(hex: string, greying: number): string {
  if (greying <= 0) return hex;
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number, g: number): number => Math.round(c + (g - c) * Math.min(1, greying));
  const r = mix((n >> 16) & 255, 0xc2);
  const g = mix((n >> 8) & 255, 0xbd);
  const b = mix(n & 255, 0xb6);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function useHair(ctx: DrawContext, id: string, recession: number, greying: number) {
  const style = hairStyle(id);
  const out = hairOutline(ctx.layout, style, recession);
  const p = hairPalette(greyed(ctx.hair.base, greying));
  return { style, out, p };
}

/** Behind the head: only the part that falls past the ear. */
export function HairBack({ ctx, id, recession, greying }: HairProps) {
  const { style, out, p } = useHair(ctx, id, recession, greying);
  if (style.fall < 0.10) return null;
  const l = ctx.layout;
  const half = out.halfAt(l.earY) * 1.04;
  const bottom = out.endY + l.faceH * 0.06;
  return (
    <path
      d={closedPath([
        pt(l.cx - half, l.earY - l.faceH * 0.2),
        pt(l.cx - half * 1.06, bottom),
        pt(l.cx, bottom + l.faceH * 0.03),
        pt(l.cx + half * 1.06, bottom),
        pt(l.cx + half, l.earY - l.faceH * 0.2),
      ], 0.95)}
      fill={p.shadow}
    />
  );
}

export function Hair({ ctx, id, recession, greying }: HairProps) {
  const { style, out, p } = useHair(ctx, id, recession, greying);
  if (style.family === 'skin' && style.id === 'bald') return null;

  const l = ctx.layout;
  const clip = `${ctx.uid}-hair`;
  const grad = `${ctx.uid}-fadegrad`;
  // Every style gets the dissolve, not just the barbered ones: a hard bottom
  // edge on a haircut is the helmet tell whatever the style is called.
  // Every style with no fall gets the dissolve. A hard bottom edge is the
  // helmet tell whether the barber put a fade in it or not.
  const fades = style.fall < 0.08 && style.family !== 'skin';
  const fadeTop = l.crownY + l.faceH * style.fadeT - (out.endY - out.topY) * (0.18 + style.fade * 0.34);
  const fadeBottom = out.endY + l.faceH * 0.004;

  return (
    <g>
      <defs>
        <clipPath id={clip}><path d={out.mass} /></clipPath>
        {fades && (
          <linearGradient id={grad} x1="0" x2="0" y1={fadeTop} y2={fadeBottom} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={ctx.skin.soft} stopOpacity="0" />
            <stop offset={`${String(Math.round(46 + style.fade * 16))}%`} stopColor={ctx.skin.soft} stopOpacity={String(0.18 + style.fade * 0.30)} />
            <stop offset="100%" stopColor={ctx.skin.soft} stopOpacity={String(0.70 + style.fade * 0.30)} />
          </linearGradient>
        )}
      </defs>

      <path d={out.mass} fill={p.base} />
      {/* the mass turns away from the light at its edges */}
      <g clipPath={`url(#${clip})`}>
        <path
          d={out.mass} fill="none" stroke={p.shadow}
          strokeWidth={l.faceH * 0.05} opacity={0.55}
        />
        <HairTexture
          l={l} style={style} out={out} p={p} uid={ctx.uid} seed={ctx.seed} detail={ctx.detail}
        />
        {fades && (
          <rect
            x={0} y={fadeTop} width={l.cx * 2}
            height={Math.max(1, fadeBottom - fadeTop)} fill={`url(#${grad})`}
          />
        )}
      </g>
      {/* the hairline is a shadow on the forehead, never a drawn line */}
      <path
        d={out.mass} fill="none" stroke={p.shadow}
        strokeWidth={Math.max(1, l.faceH * 0.009)} opacity={0.4}
      />
      {style.family === 'bun' && (
        <g>
          <circle
            cx={l.cx + l.halfAt(out.topY + l.faceH * 0.05) * 0.1}
            cy={out.topY - l.faceH * 0.045}
            r={l.faceH * 0.075} fill={p.base}
          />
          <circle
            cx={l.cx} cy={out.topY - l.faceH * 0.055}
            r={l.faceH * 0.045} fill={p.light} opacity={0.35}
          />
        </g>
      )}
    </g>
  );
}
