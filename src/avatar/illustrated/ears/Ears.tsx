// Ears.
//
// Drawn against the silhouette rather than at a fixed offset, so an ear on a
// broad skull sits where a broad skull's ear sits. The inner fold is two
// lines: the helix turning in, and the tragus. Any more than that at portrait
// size is detail nobody sees.

import { Fragment } from 'react';
import { closedPath, clamp, nudge, openPath, pt, type Pt } from '../geom';
import type { DrawContext } from '../types';
import { earSpec, type EarOutline } from './constructions';

function outlinePath(outline: EarOutline, w: number, h: number, bulge: number, lobe: number): string {
  const by = -h / 2 + h * bulge;
  const pts: Pt[] = outline === 'angular'
    ? [pt(0, -h / 2), pt(w * 0.92, -h * 0.30), pt(w * 0.86, h * 0.10), pt(w * 0.40, h / 2), pt(0, h * 0.42)]
    : outline === 'pointed'
      ? [pt(0, -h / 2), pt(w * 0.72, -h * 0.44), pt(w, by), pt(w * 0.70, h * 0.18), pt(w * 0.34, h / 2), pt(0, h * 0.40)]
      : outline === 'square'
        ? [pt(0, -h / 2), pt(w * 0.88, -h * 0.42), pt(w * 0.96, h * 0.04), pt(w * 0.72, h * 0.40), pt(0, h * 0.46)]
        : outline === 'long'
          ? [pt(0, -h / 2), pt(w * 0.80, -h * 0.34), pt(w * 0.88, by), pt(w * 0.66, h * 0.24), pt(w * 0.30, h / 2), pt(0, h * 0.44)]
          : [pt(0, -h / 2), pt(w * 0.78, -h * 0.36), pt(w, by), pt(w * 0.74, h * 0.20), pt(w * 0.36, h / 2), pt(0, h * 0.42)];
  const withLobe = [...pts.slice(0, -1), pt(w * (0.22 + lobe * 0.30), h * (0.46 + lobe * 0.16)), pts[pts.length - 1] as Pt];
  return closedPath([...withLobe, pt(0, 0)], outline === 'angular' || outline === 'square' ? 0.78 : 1.02);
}

export function Ears({ ctx, id }: { readonly ctx: DrawContext; readonly id: string }) {
  const spec = earSpec(id);
  const { layout, skin, morph, detail } = ctx;
  const h = layout.earHeight * nudge(morph.earSize, 0.16);
  const w = h * spec.ratio;
  const y = layout.earY;
  const push = w * (spec.projection * 0.6 + clamp(morph.earProtrusion, -1, 1) * 0.10);

  return (
    <Fragment>
      {[-1, 1].map((side) => (
        <g
          key={side}
          transform={`translate(${String(layout.cx + (layout.halfAt(y) - w * 0.30 + push) * side)},${String(y)}) scale(${String(side)},1)`}
        >
          <path d={outlinePath(spec.outline, w, h, spec.bulge, spec.lobe)} fill={skin.base} />
          <path
            d={outlinePath(spec.outline, w, h, spec.bulge, spec.lobe)}
            fill="none" stroke={skin.edge} strokeWidth={Math.max(0.8, w * 0.045)} opacity={0.5}
          />
          {/* the bowl is in shadow, which is what stops an ear reading as a flap */}
          <path
            d={closedPath([
              pt(w * 0.20, -h * 0.26), pt(w * 0.60, -h * 0.16),
              pt(w * 0.52, h * 0.18), pt(w * 0.16, h * 0.20),
            ], 1.0)}
            fill={skin.deep} opacity={0.30}
          />
          {detail > 0.4 && (
            <path
              d={openPath([
                pt(w * 0.14, -h * 0.30), pt(w * 0.62, -h * 0.22),
                pt(w * 0.58, h * 0.10), pt(w * 0.22, h * 0.24),
              ], 1.0)}
              fill="none" stroke={skin.line}
              strokeWidth={Math.max(0.7, w * 0.05)} opacity={0.55 * spec.fold} strokeLinecap="round"
            />
          )}
        </g>
      ))}
    </Fragment>
  );
}
