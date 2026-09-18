// The skull, as one filled shape.
//
// Everything else in the portrait is drawn on top of this, so it carries the
// silhouette and nothing else: no features, no shading, no outline in the
// cartoon sense. The edge is a thin darker stroke of the skin's own colour,
// which is what gives an illustration its weight without ringing the head in
// black.

import { closedPath, pt, type Pt } from '../geom';
import { jawTension, type FaceLayout } from '../layout';
import type { DrawContext } from '../types';

/** The closed silhouette, right side down and left side back up. The two sides
 *  are separate arrays rather than a mirror, because the asymmetry the layout
 *  applies has to survive to the path. */
export function headPath(l: FaceLayout): string {
  const right = l.right as Pt[];
  const left = [...(l.left as Pt[])].reverse();
  // An apex on the centre line. Without it the closing segment runs straight
  // between the two crown landmarks and every skull comes out with a flat top
  // -- which is exactly what the first pass produced.
  const apex = pt(l.cx, l.crownY - l.faceH * 0.020);
  // The side endpoints are not shared: each crown and chin landmark has its
  // own x coordinate. Dropping the left endpoints clips that half of the skull
  // and draws a diagonal from the right chin to the left jaw.
  const chin = pt(l.cx, l.chinY + l.faceH * 0.012);
  return closedPath([apex, ...right, chin, ...left], jawTension(l.jaw));
}

export function Head({ ctx }: { readonly ctx: DrawContext }) {
  const { layout, skin } = ctx;
  const d = headPath(layout);
  return (
    <g>
      <path d={d} fill={skin.base} />
      <path
        d={d} fill="none" stroke={skin.edge}
        strokeWidth={Math.max(1, layout.faceH * 0.0085)} opacity={0.45}
      />
    </g>
  );
}

/** A clip of the face, for anything that must not paint past the silhouette --
 *  stubble, complexion details, the fade at the edge of a haircut. */
export function HeadClip({ ctx }: { readonly ctx: DrawContext }) {
  return (
    <defs>
      <clipPath id={`${ctx.uid}-face`}><path d={headPath(ctx.layout)} /></clipPath>
    </defs>
  );
}
