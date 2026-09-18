// Where the light falls -- as an illustrator would put it, not as a renderer.
//
// Two earlier attempts and what each got wrong: flat low-opacity blobs on the
// temple and cheek read as patches; soft radial gradients over the whole face
// read as an airbrush and washed the colour out. The reference does neither.
// Its skin is close to flat, and the modelling is a small number of *defined*
// shapes -- one plane down the shadow side, a wedge under the cheekbone, a
// socket under each brow, the underside of the jaw -- plus a darker rim just
// inside the silhouette. Hard-ish edges, restrained opacity, and nothing
// anywhere in the middle of the face.
//
// The rim is the detail that does the most work. A vector portrait without one
// looks like a sticker; with one it looks drawn.

import { closedPath, lerp, pt } from '../geom';
import { headPath } from '../heads/Head';
import type { DrawContext } from '../types';

export function ShadingDefs({ ctx }: { readonly ctx: DrawContext }) {
  const { uid, skin, layout: l } = ctx;
  return (
    <defs>
      {/* The only gradient on the face, and it is nearly nothing: a hint that
          the light is above, so the jaw is not as bright as the forehead. */}
      <linearGradient
        id={`${uid}-top`} gradientUnits="userSpaceOnUse"
        x1={0} y1={l.crownY} x2={0} y2={l.chinY}
      >
        <stop offset="0%" stopColor={skin.light} stopOpacity="0.26" />
        <stop offset="40%" stopColor={skin.light} stopOpacity="0.04" />
        <stop offset="100%" stopColor={skin.soft} stopOpacity="0.16" />
      </linearGradient>
      <linearGradient
        id={`${uid}-neck`} gradientUnits="userSpaceOnUse"
        x1={0} y1={l.chinY - l.faceH * 0.08} x2={0} y2={l.chinY + l.faceH * 0.22}
      >
        {/* Enough that the neck sits in the jaw's shadow, not so much that it
            becomes a dark column with a head balanced on it. */}
        <stop offset="0%" stopColor={skin.line} stopOpacity="0.34" />
        <stop offset="100%" stopColor={skin.line} stopOpacity="0.20" />
      </linearGradient>
    </defs>
  );
}

/** The inner boundary of the shadow side, as a fraction of the half-width at
 *  that height. Authored rather than computed: this contour is the drawing. */
const SHADOW_EDGE: readonly (readonly [number, number])[] = [
  [0.10, 0.88], [0.20, 0.84], [0.32, 0.85], [0.44, 0.88],
  [0.56, 0.86], [0.68, 0.82], [0.80, 0.80], [0.92, 0.62], [0.99, 0.36],
];

export function Shading({ ctx }: { readonly ctx: DrawContext }) {
  const { layout: l, skin, detail, uid } = ctx;
  const at = (t: number): number => lerp(l.crownY, l.chinY, t);
  const w = (y: number): number => l.halfAt(y);
  const cover = `M0,${String(l.crownY - 40)} H${String(l.cx * 2)} V${String(l.chinY + 60)} H0 Z`;

  /* The shadow side: silhouette down, authored contour back up. One shape. */
  const sideShadow = (dir: number): string => {
    const outer = SHADOW_EDGE.map(([t]) => pt(l.cx + w(at(t)) * dir * 1.02, at(t)));
    const inner = [...SHADOW_EDGE].reverse().map(([t, k]) => pt(l.cx + w(at(t)) * dir * k, at(t)));
    return closedPath([...outer, ...inner], 0.95);
  };

  /* The hollow under the cheekbone. A wedge, not a smudge. */
  const hollow = (dir: number): string => closedPath([
    pt(l.cx + w(at(0.58)) * dir * 0.95, at(0.58)),
    pt(l.cx + w(at(0.72)) * dir * 0.88, at(0.72)),
    pt(l.cx + w(at(0.82)) * dir * 0.72, at(0.82)),
    pt(l.cx + w(at(0.70)) * dir * 0.64, at(0.70)),
    pt(l.cx + w(at(0.60)) * dir * 0.72, at(0.60)),
  ], 0.72);

  /* The underside of the jaw, meeting under the chin. */
  const underJaw = closedPath([
    pt(l.cx - w(at(0.91)) * 0.95, at(0.915)),
    pt(l.cx - w(at(0.97)) * 0.90, at(0.975)),
    pt(l.cx, l.chinY + l.faceH * 0.004),
    pt(l.cx + w(at(0.97)) * 0.90, at(0.975)),
    pt(l.cx + w(at(0.91)) * 0.95, at(0.915)),
    pt(l.cx, at(0.965)),
  ], 1.0);

  return (
    <g clipPath={`url(#${uid}-face)`}>
      <path d={cover} fill={`url(#${uid}-top)`} />
      {/* One side, not two. Shading both sides leaves a lit column down the
          middle of the face, which is a stripe rather than a form. */}
      <path d={sideShadow(1)} fill={skin.deep} opacity={0.36} />
      <path d={sideShadow(-1)} fill={skin.soft} opacity={0.20} />
      {detail > 0.3 && (
        <>
          <path d={hollow(1)} fill={skin.deep} opacity={0.27} />
          <path d={hollow(-1)} fill={skin.soft} opacity={0.30} />
          <path d={underJaw} fill={skin.deep} opacity={0.32} />
        </>
      )}
      {/* the brow ridge sits over each eye */}
      {detail > 0.35 && [-1, 1].map((dir) => (
        <path
          key={`s${dir}`}
          d={closedPath([
            pt(l.cx + dir * (l.eyeSpan / 2 - l.eyeSize * 0.58), l.browY + l.eyeSize * 0.06),
            pt(l.cx + dir * (l.eyeSpan / 2 + l.eyeSize * 0.62), l.browY - l.eyeSize * 0.03),
            pt(l.cx + dir * (l.eyeSpan / 2 + l.eyeSize * 0.66), l.eyeY + l.eyeSize * 0.12),
            pt(l.cx + dir * (l.eyeSpan / 2), l.eyeY - l.eyeSize * 0.14),
            pt(l.cx + dir * (l.eyeSpan / 2 - l.eyeSize * 0.50), l.eyeY - l.eyeSize * 0.06),
          ], 0.85)}
          fill={skin.soft} opacity={dir > 0 ? 0.32 : 0.24}
        />
      ))}
      {/* The rim. Half the stroke falls outside the clip, so what survives is
          a band just inside the silhouette -- which is what stops a flat
          vector face reading as a sticker. */}
      <path
        d={headPath(l)} fill="none" stroke={skin.soft}
        strokeWidth={l.faceH * 0.012} opacity={0.48}
      />
      <path
        d={headPath(l)} fill="none" stroke={skin.deep}
        strokeWidth={l.faceH * 0.004} opacity={0.42}
      />
    </g>
  );
}
