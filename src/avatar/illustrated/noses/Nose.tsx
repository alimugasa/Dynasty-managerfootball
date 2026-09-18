// The nose, as filled form.
//
// Filled bridge and wing planes carry the form. Short crease accents define
// the tip and bridge without outlining the entire nose as a separate object.

import { closedPath, clamp, nudge, openPath, pt } from '../geom';
import type { DrawContext } from '../types';
import { noseSpec, type NoseSpec, type TipShape } from './constructions';

/** How far the bridge bows out at its midpoint. The difference between a
 *  straight bridge and an aquiline one is entirely here. */
function bulgeAt(spec: NoseSpec, w: number): number {
  if (spec.profile === 'convex') return w * 0.22;
  if (spec.profile === 'concave') return -w * 0.20;
  if (spec.profile === 'stepped') return w * 0.30;
  return 0;
}

function tipPath(shape: TipShape, tw: number, cy: number): string {
  const r = tw;
  const round = (kx: number, ky: number, tension: number): string => closedPath([
    pt(-r * kx, cy), pt(-r * kx * 0.72, cy - r * ky), pt(0, cy - r * ky * 1.12),
    pt(r * kx * 0.72, cy - r * ky), pt(r * kx, cy),
    pt(r * kx * 0.66, cy + r * ky * 0.92), pt(0, cy + r * ky * 1.05),
    pt(-r * kx * 0.66, cy + r * ky * 0.92),
  ], tension);
  switch (shape) {
    case 'pointed': return round(0.82, 0.78, 0.82);
    case 'bulbous': return round(1.10, 1.00, 1.15);
    case 'flat': return round(1.06, 0.62, 0.95);
    case 'narrow': return round(0.74, 0.86, 0.95);
    case 'square': return round(1.00, 0.84, 0.62);
    default: return round(0.96, 0.88, 1.05);
  }
}

function nostrilPath(shape: NoseSpec['nostril'], w: number, h: number): string {
  switch (shape) {
    case 'slit': return closedPath([pt(-w, 0), pt(0, -h * 0.55), pt(w, 0), pt(0, h * 0.4)], 0.8);
    case 'round': return closedPath([pt(-w, 0), pt(0, -h), pt(w, 0), pt(0, h)], 1.15);
    case 'wide': return closedPath([pt(-w * 1.3, 0), pt(0, -h * 0.8), pt(w * 1.3, 0), pt(0, h * 0.7)], 1.0);
    case 'flared': return closedPath([pt(-w * 1.25, h * 0.2), pt(-w * 0.3, -h * 0.9), pt(w * 1.1, -h * 0.1), pt(0, h * 0.8)], 1.0);
    case 'tucked': return closedPath([pt(-w * 0.8, 0), pt(0, -h * 0.6), pt(w * 0.8, 0.1), pt(0, h * 0.5)], 0.9);
    default: return closedPath([pt(-w, 0), pt(-w * 0.2, -h * 0.85), pt(w, 0), pt(0, h * 0.75)], 1.05);
  }
}

export function Nose({ ctx, id }: { readonly ctx: DrawContext; readonly id: string }) {
  const spec = noseSpec(id);
  const { layout, skin, morph, detail } = ctx;
  const nw = layout.noseWidth * nudge(morph.alarFlare, 0.10);
  const L = (layout.noseBaseY - layout.browY) * (0.86 - spec.bridgeTop) * nudge(morph.noseLength, 0.10);

  const rw = (spec.rootW * nw) / 2 * nudge(morph.bridgeWidth, 0.16);
  const bw = (spec.bridgeW * nw) / 2 * nudge(morph.bridgeWidth, 0.16);
  const tw = (spec.tipW * nw) / 2 * nudge(morph.tipRound, 0.14);
  const aw = (spec.alaW * nw) / 2;
  const lift = spec.alaLift * nw;
  const drop = spec.tipDrop * nw + clamp(morph.tipAngle, -1, 1) * nw * 0.05;
  const bulge = bulgeAt(spec, bw) * nudge(morph.bridgeHeight, 0.4);
  const depth = spec.depth * (0.78 + clamp(morph.noseProjection, -1, 1) * 0.22);
  const tipY = -drop - tw * 0.42;

  /* The shadow side, as one continuous form: down the bridge, around the tip,
     and out under the far wing. One shape rather than a flank plus a tip plus
     a wing, because three overlapping shapes at three opacities is what made
     the first version read as a smudge. */
  const shadow = closedPath([
    pt(rw * 0.55, -L),
    pt(bw + bulge, -L * 0.52),
    pt(tw * 1.02, tipY + tw * 0.25),
    pt(aw * 1.02, -lift * 0.55),
    pt(aw * 0.86, nw * 0.05),
    pt(aw * 0.30, nw * 0.075),
    pt(tw * 0.10, nw * 0.02),
    pt(tw * 0.16, tipY + tw * 0.1),
    pt(bw * 0.34, -L * 0.5),
    pt(rw * 0.16, -L),
  ], 0.95);

  const nostrilW = nw * 0.083 * nudge(morph.nostrilWidth, 0.2);
  const nostrilY = -lift * 0.32;
  const nostrilX = aw - tw * 0.24;
  const line = Math.max(0.7, nw * 0.032);

  return (
    <g transform={`translate(${String(layout.cx)},${String(layout.noseBaseY)})`}>
      {/* the near wing, which turns away from the light much less */}
      <path
        d={closedPath([
          pt(-aw * 1.02, -lift * 0.55),
          pt(-aw * 0.86, nw * 0.05),
          pt(-aw * 0.28, nw * 0.07),
          pt(-tw * 0.55, -lift * 0.55),
        ], 1.05)}
        fill={skin.soft} opacity={0.30 + depth * 0.18}
      />
      <path d={shadow} fill={skin.deep} opacity={0.24 + depth * 0.32} />
      {detail > 0.4 && <path d={openPath([
        pt(bw * 0.70 + bulge * 0.5, -L * 0.67),
        pt(bw + bulge, -L * 0.38),
        pt(tw * 1.03, tipY + tw * 0.14),
      ], 0.9)} fill="none" stroke={skin.line} strokeWidth={line * 0.8}
        opacity={0.34} strokeLinecap="round" />}

      {/* The tip interrupts the bridge shadow with skin, not a pale circular
          spot. Its small upper-plane accent joins it back to the bridge. */}
      <path
        d={tipPath(spec.tip, tw * 0.94, tipY - tw * 0.06)}
        fill={skin.base}
      />
      <path d={openPath([
        pt(-tw * 0.55, tipY), pt(-tw * 0.18, tipY - tw * 0.32), pt(tw * 0.38, tipY - tw * 0.12),
      ], 0.95)} fill="none" stroke={skin.light} strokeWidth={Math.max(1, tw * 0.25)}
        opacity={0.6} strokeLinecap="round" />

      {/* the crease under the tip, and the two wing creases. These three short
          lines are most of what makes a nose read as a nose at portrait size,
          and the reference has all three. */}
      <path
        d={openPath([
          pt(-aw * 0.58, -nw * 0.01), pt(-tw * 0.28, nw * 0.06),
          pt(0, nw * 0.085), pt(tw * 0.28, nw * 0.06), pt(aw * 0.58, -nw * 0.01),
        ], 1.0)}
        fill="none" stroke={skin.line} strokeWidth={line} strokeLinecap="round" opacity={0.66}
      />
      {[-1, 1].map((dir) => (
        <path
          key={dir}
          d={openPath([
            pt(dir * (aw * 0.96), -lift * 0.62),
            pt(dir * (aw * 1.06), -lift * 0.10),
            pt(dir * (aw * 0.80), nw * 0.055),
          ], 1.0)}
          fill="none" stroke={skin.line} strokeWidth={line}
          opacity={dir > 0 ? 0.50 : 0.34} strokeLinecap="round"
        />
      ))}

      {[-1, 1].map((dir) => (
        <g key={dir} transform={`translate(${String(dir * nostrilX)},${String(nostrilY)}) scale(${String(dir)},1)`}>
          <path d={nostrilPath(spec.nostril, nostrilW, nw * 0.044)} fill={skin.line} opacity={0.88} />
        </g>
      ))}

      {/* a short highlight on the bridge, well clear of the brow. The first
          version ran it the full length of the nose and it read as a line
          drawn down the middle of the face. */}
      {detail > 0.4 && (
        <path
          d={openPath([
            pt(-bw * 0.14, -L * 0.46),
            pt(-bw * 0.10 + bulge * 0.15, -L * 0.24),
            pt(-tw * 0.06, tipY - tw * 0.35),
          ], 0.95)}
          fill="none" stroke={skin.light}
          strokeWidth={Math.max(1, bw * 0.30)} strokeLinecap="round" opacity={0.20}
        />
      )}
    </g>
  );
}
