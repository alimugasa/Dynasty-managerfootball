// The nose, as filled form.
//
// No outline anywhere. A nose drawn with a contour reads as a symbol, which is
// what every version of this project has produced so far -- an arrowhead, then
// a bowtie, then two lines and two dots. What actually reads as a nose is the
// shadow down one side of the bridge, the light along the other, a tip with
// volume and two wings that turn away from the light. The skin underneath is
// the lit plane; nothing draws it.

import { closedPath, clamp, nudge, openPath, pt, type Pt } from '../geom';
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
  // Measured from the brow, and deliberately short of it: a bridge modelled
  // all the way up to the brow line reads as a stripe down the middle of the
  // face, which is what the first pass produced.
  const L = (layout.noseBaseY - layout.browY) * (0.80 - spec.bridgeTop) * nudge(morph.noseLength, 0.10);

  const rw = (spec.rootW * nw) / 2 * nudge(morph.bridgeWidth, 0.16);
  const bw = (spec.bridgeW * nw) / 2 * nudge(morph.bridgeWidth, 0.16);
  const tw = (spec.tipW * nw) / 2 * nudge(morph.tipRound, 0.14);
  const aw = (spec.alaW * nw) / 2;
  const lift = spec.alaLift * nw;
  const drop = spec.tipDrop * nw + clamp(morph.tipAngle, -1, 1) * nw * 0.05;
  const bulge = bulgeAt(spec, bw) * nudge(morph.bridgeHeight, 0.4);
  const depth = spec.depth * (0.78 + clamp(morph.noseProjection, -1, 1) * 0.22);
  const tipY = -drop - tw * 0.5;

  /* One side of the bridge, from the root down to the wing. The shadow side
     gets it at full strength and the lit side at a fraction, which is the fill
     light -- without it the nose reads as half a nose. */
  const flank = (dir: number): string => {
    const outer: Pt[] = [
      pt(dir * rw, -L),
      pt(dir * (bw + bulge), -L * 0.52),
      pt(dir * tw * 0.98, tipY + tw * 0.2),
      pt(dir * aw, -lift * 0.7),
      pt(dir * aw * 0.72, nw * 0.045),
    ];
    const inner: Pt[] = [
      pt(dir * tw * 0.12, nw * 0.02),
      pt(dir * tw * 0.22, tipY),
      pt(dir * bw * 0.26, -L * 0.5),
      pt(dir * rw * 0.22, -L),
    ];
    return closedPath([...outer, ...inner], 0.95);
  };

  const nostrilW = nw * 0.15 * nudge(morph.nostrilWidth, 0.2);
  const nostrilY = -lift * 0.35;
  const nostrilX = aw - tw * 0.22;

  return (
    <g transform={`translate(${String(layout.cx)},${String(layout.noseBaseY)})`}>
      {/* the shaded flank, then the lit one at fill strength */}
      <path d={flank(1)} fill={skin.soft} opacity={0.26 + depth * 0.34} />
      <path d={flank(-1)} fill={skin.soft} opacity={(0.26 + depth * 0.34) * 0.32} />

      {/* the tip has volume: a form below, light above */}
      <path d={tipPath(spec.tip, tw * 1.05, tipY + tw * 0.1)} fill={skin.soft} opacity={0.46} />
      <path
        d={tipPath(spec.tip, tw * 0.80, tipY - tw * 0.16)}
        fill={skin.light} opacity={0.42 + depth * 0.18}
      />

      {/* the wings turn away from the light on both sides */}
      {[-1, 1].map((dir) => (
        <path
          key={dir}
          d={closedPath([
            pt(dir * (aw - tw * 0.05), -lift * 0.4),
            pt(dir * aw, -lift * 0.05),
            pt(dir * (aw * 0.82), nw * 0.055),
            pt(dir * (aw * 0.42), nw * 0.03),
            pt(dir * (tw * 0.6), -lift * 0.5),
          ], 1.05)}
          fill={skin.soft}
          opacity={dir > 0 ? 0.70 : 0.44}
        />
      ))}

      {/* the bridge highlight: narrow, offset toward the light, never white */}
      <path
        d={openPath([
          pt(-rw * 0.16, -L * 0.62),
          pt(-bw * 0.18 + bulge * 0.2, -L * 0.34),
          pt(-tw * 0.10, tipY - tw * 0.2),
        ], 0.95)}
        fill="none" stroke={skin.light}
        strokeWidth={Math.max(1.0, bw * 0.28)} strokeLinecap="round"
        opacity={0.16 + depth * 0.08}
      />

      {/* under the nose, and the nostrils themselves */}
      <path
        d={closedPath([
          pt(-aw * 0.9, nw * 0.02), pt(0, -nw * 0.03),
          pt(aw * 0.9, nw * 0.02), pt(0, nw * 0.10),
        ], 1.0)}
        fill={skin.deep} opacity={0.44}
      />
      {[-1, 1].map((dir) => (
        <g key={dir} transform={`translate(${String(dir * nostrilX)},${String(nostrilY)}) scale(${String(dir)},1)`}>
          <path d={nostrilPath(spec.nostril, nostrilW, nw * 0.13)} fill={skin.line} opacity={0.88} />
        </g>
      ))}
      {detail > 0.5 && [-1, 1].map((dir) => (
        <path
          key={dir}
          d={openPath([
            pt(dir * (aw * 1.02), -lift * 0.5),
            pt(dir * (aw * 1.1), -lift * 0.05),
            pt(dir * (aw * 0.86), nw * 0.06),
          ], 1.0)}
          fill="none" stroke={skin.line} strokeWidth={Math.max(0.7, nw * 0.022)}
          opacity={dir > 0 ? 0.40 : 0.24} strokeLinecap="round"
        />
      ))}
    </g>
  );
}
