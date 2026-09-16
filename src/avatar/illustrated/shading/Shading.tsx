// Where the light falls.
//
// Second attempt, and the first one is worth recording because it is the
// obvious mistake: low-opacity shapes for the temple, the cheek and the jaw,
// laid over the skin. Even at ten per cent a hard-edged shape reads as a
// patch, and twenty faces came back looking blotched rather than modelled.
//
// Soft edges are not optional in this style, so every shadow here is a shape
// filled with a gradient that fades to nothing rather than a flat fill, and
// there are four of them rather than ten. The brief's line is the test: imply
// depth, do not cover the face in gradients.

import { closedPath, lerp, pt } from '../geom';
import type { DrawContext } from '../types';

export function ShadingDefs({ ctx }: { readonly ctx: DrawContext }) {
  const { uid, skin, layout: l } = ctx;
  const edge = l.halfAt(l.eyeY);
  return (
    <defs>
      {/* the two sides of the face, fading inward. The key is up and to the
          camera's left, so the right side carries most of it. */}
      <linearGradient
        id={`${uid}-sideR`} gradientUnits="userSpaceOnUse"
        x1={l.cx + edge} y1={0} x2={l.cx + edge * 0.10} y2={0}
      >
        <stop offset="0%" stopColor={skin.deep} stopOpacity="0.62" />
        <stop offset="38%" stopColor={skin.soft} stopOpacity="0.28" />
        <stop offset="100%" stopColor={skin.soft} stopOpacity="0" />
      </linearGradient>
      <linearGradient
        id={`${uid}-sideL`} gradientUnits="userSpaceOnUse"
        x1={l.cx - edge} y1={0} x2={l.cx - edge * 0.22} y2={0}
      >
        <stop offset="0%" stopColor={skin.soft} stopOpacity="0.34" />
        <stop offset="100%" stopColor={skin.soft} stopOpacity="0" />
      </linearGradient>
      {/* light from above: strongest on the forehead, gone by the mouth */}
      <linearGradient
        id={`${uid}-top`} gradientUnits="userSpaceOnUse"
        x1={0} y1={l.crownY} x2={0} y2={l.mouthY}
      >
        <stop offset="0%" stopColor={skin.light} stopOpacity="0.46" />
        <stop offset="45%" stopColor={skin.light} stopOpacity="0.10" />
        <stop offset="100%" stopColor={skin.light} stopOpacity="0" />
      </linearGradient>
      {/* and the underside of the jaw, turning away from it */}
      <linearGradient
        id={`${uid}-under`} gradientUnits="userSpaceOnUse"
        x1={0} y1={l.chinY} x2={0} y2={lerp(l.mouthY, l.chinY, 0.1)}
      >
        <stop offset="0%" stopColor={skin.deep} stopOpacity="0.52" />
        <stop offset="100%" stopColor={skin.deep} stopOpacity="0" />
      </linearGradient>
      <linearGradient
        id={`${uid}-neck`} gradientUnits="userSpaceOnUse"
        x1={0} y1={l.chinY - l.faceH * 0.09} x2={0} y2={l.chinY + l.faceH * 0.2}
      >
        {/* The darker, more neutral line colour rather than the deep skin
            tone: a light complexion's deep tone is a saturated orange, and at
            the opacity a neck in shadow needs, the neck became the orange. */}
        <stop offset="0%" stopColor={skin.line} stopOpacity="0.46" />
        <stop offset="100%" stopColor={skin.line} stopOpacity="0.26" />
      </linearGradient>
    </defs>
  );
}

export function Shading({ ctx }: { readonly ctx: DrawContext }) {
  const { layout: l, skin, detail, uid } = ctx;
  const at = (t: number): number => lerp(l.crownY, l.chinY, t);
  const w = (y: number): number => l.halfAt(y);
  const cover = `M0,${String(l.crownY - 30)} H${String(l.cx * 2)} V${String(l.chinY + 40)} H0 Z`;

  /* The one remaining discrete shape: the hollow under the cheekbone. It is
     the plane change that makes a face look like a face rather than an egg,
     and it is drawn with a gradient so it has no edge of its own. */
  const hollow = (dir: number): string => closedPath([
    pt(l.cx + w(at(0.55)) * dir * 0.98, at(0.55)),
    pt(l.cx + w(at(0.70)) * dir * 0.94, at(0.70)),
    pt(l.cx + w(at(0.80)) * dir * 0.74, at(0.80)),
    pt(l.cx + w(at(0.66)) * dir * 0.50, at(0.67)),
    pt(l.cx + w(at(0.55)) * dir * 0.58, at(0.56)),
  ], 1.05);

  return (
    <g clipPath={`url(#${uid}-face)`}>
      <path d={cover} fill={`url(#${uid}-top)`} />
      <path d={cover} fill={`url(#${uid}-sideR)`} />
      <path d={cover} fill={`url(#${uid}-sideL)`} />
      <path d={cover} fill={`url(#${uid}-under)`} />
      {detail > 0.3 && [-1, 1].map((dir) => (
        <path
          key={dir} d={hollow(dir)}
          fill={`url(#${uid}-side${dir > 0 ? 'R' : 'L'})`}
          opacity={dir > 0 ? 0.42 : 0.24}
        />
      ))}
      {/* the brow ridge casts down onto the eye sockets, both sides */}
      {detail > 0.4 && [-1, 1].map((dir) => (
        <ellipse
          key={`s${dir}`} cx={l.cx + dir * (l.eyeSpan / 2)} cy={l.eyeY - l.eyeSize * 0.28}
          rx={l.eyeSize * 0.92} ry={l.eyeSize * 0.52}
          fill={skin.soft} opacity={0.20}
        />
      ))}
    </g>
  );
}
