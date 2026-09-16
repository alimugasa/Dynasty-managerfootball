// Brows as shapes, not strokes.
//
// A stroke has one thickness. A brow does not: it is heavy at the inner end,
// heaviest at the arch and it tapers to nothing at the tail, and that profile
// is most of what separates one brow from another. So each construction is
// sampled along its length, given a thickness at every sample, and closed into
// a filled shape.

import { Fragment } from 'react';
import { clamp, closedPath, lerp, nudge, pt, type Pt } from '../geom';
import type { DrawContext } from '../types';
import { browSpec, type BrowSpec } from './constructions';

const SAMPLES = 9;

/** Skew the parameter so the arch peaks where the construction says it does,
 *  rather than always in the middle. */
const skew = (t: number, apex: number): number =>
  Math.pow(t, Math.log(0.5) / Math.log(clamp(apex, 0.12, 0.88)));

function browShape(spec: BrowSpec, len: number, thickScale: number): string {
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const t = i / (SAMPLES - 1);
    const x = t * len;
    const s = skew(t, spec.apex);
    const rise = -Math.sin(Math.PI * s) * spec.arch * len;
    const tilt = -spec.tilt * len * t;
    const th = (t < 0.5
      ? lerp(spec.inner, spec.peak, t * 2)
      : lerp(spec.peak, spec.tail, (t - 0.5) * 2)) * len * thickScale;
    const cy = rise + tilt;
    top.push(pt(x, cy - th / 2));
    bottom.push(pt(x, cy + th / 2));
  }
  return closedPath([...top, ...bottom.reverse()], 0.85);
}

export function Brows({ ctx, id }: { readonly ctx: DrawContext; readonly id: string }) {
  const spec = browSpec(id);
  const { layout, morph, brow, detail } = ctx;
  const len = layout.eyeSize * spec.length * nudge(morph.browLength, 0.14);
  const thickScale = nudge(morph.browThickness, 0.32) * 1.30;
  const gap = layout.eyeSize * spec.gap;
  const d = browShape(spec, len, thickScale);
  const asym = clamp(morph.asymBrow, -1, 1);

  return (
    <Fragment>
      {[-1, 1].map((side) => (
        <g
          key={side}
          transform={`translate(${String(layout.cx + gap * side)},${String(layout.browY + (side > 0 ? asym * len * 0.035 : 0))}) scale(${String(side)},1)`}
        >
          {/* A soft under-shadow gives the brow somewhere to sit on the ridge. */}
          <path d={d} fill={ctx.skin.deep} opacity={0.22} transform={`translate(0,${String(len * 0.035)})`} />
          <path d={d} fill={brow.base} />
          {detail > 0.5 && (
            <path d={d} fill={brow.light} opacity={0.35} transform={`translate(0,${String(-len * 0.012)}) scale(0.94,0.52)`} />
          )}
        </g>
      ))}
    </Fragment>
  );
}
