// Eyes, drawn twice from one construction.
//
// One eye is built in its own local space -- inner corner at -w, outer at +w --
// and the other is the same drawing mirrored. That is what guarantees the pair
// match, and it is also what makes the deliberate asymmetry meaningful: the
// small differences between the two sides are applied on purpose, one
// parameter at a time, rather than emerging from two hand-placed drawings
// drifting apart.

import { Fragment } from 'react';
import { clamp, openPath, pt } from '../geom';
import { shade } from '../palette';
import type { DrawContext } from '../types';
import { eyeSpec, type EyeSpec } from './constructions';
import { heterochromicPair, type EyeColour } from './colors';

/** Not white. A pure-white sclera is the single fastest way to make a portrait
 *  read as a cartoon, and on a deep complexion it reads as a hole. */
const sclera = (pigment: number): string =>
  shade('#f2ece4', -0.10 + pigment * 0.055);

function lidPaths(spec: EyeSpec, w: number, h: number): { upper: string; lower: string } {
  const inner = pt(-w, spec.innerY * h);
  const outer = pt(w, spec.outerY * h);
  const ax = -w + 2 * w * spec.upperApex;
  const lx = -w + 2 * w * spec.lowerApex;
  return {
    upper: openPath([
      inner,
      pt(inner.x + (ax - inner.x) * 0.45, -spec.upperRise * h * 0.72),
      pt(ax, -spec.upperRise * h),
      pt(ax + (outer.x - ax) * 0.55, -spec.upperRise * h * 0.60),
      outer,
    ], 0.92),
    lower: openPath([
      inner,
      pt(inner.x + (lx - inner.x) * 0.5, spec.lowerDrop * h * 0.70),
      pt(lx, spec.lowerDrop * h),
      pt(lx + (outer.x - lx) * 0.5, spec.lowerDrop * h * 0.62),
      outer,
    ], 0.92),
  };
}

function OneEye({ ctx, spec, w, h, colour, side }: {
  readonly ctx: DrawContext;
  readonly spec: EyeSpec;
  readonly w: number;
  readonly h: number;
  readonly colour: EyeColour;
  /** -1 or 1. Only the clip id needs it: both eyes are the same drawing, and
   *  two clipPaths sharing one id is invalid SVG that happens to work. */
  readonly side: number;
}) {
  const { skin, morph, detail } = ctx;
  const { upper, lower } = lidPaths(spec, w, h);
  const opening = `${upper} ${openPath([
    pt(w, spec.outerY * h),
    pt(w * 0.4, spec.lowerDrop * h * 0.72),
    pt(-w * 0.2, spec.lowerDrop * h),
    pt(-w, spec.innerY * h),
  ], 0.92).replace('M', 'L')} Z`;
  const clipId = `${ctx.uid}-eye${side < 0 ? 'l' : 'r'}`;

  /* The iris is large and the lid cuts its top, which is what an open human
     eye does. A small iris floating in white is the cartoon tell, and it was
     the tell in the first draft of this file. */
  const irisR = (h * spec.iris) / 2 * 1.32;
  const irisY = -h * 0.10 + clamp(morph.lowerLid, -1, 1) * h * 0.05;
  const lash = Math.max(1.8, h * 0.19 * spec.lash);

  return (
    <g>
      <defs>
        <clipPath id={clipId}><path d={opening} /></clipPath>
      </defs>
      <ellipse
        cx={0} cy={-h * 0.18} rx={w * 1.20} ry={h * 1.24}
        fill={skin.deep} opacity={0.10 + clamp(morph.eyeDepth, -1, 1) * 0.05}
      />
      <path d={opening} fill={sclera(pigmentOf(ctx))} />
      <g clipPath={`url(#${clipId})`}>
        <circle cx={0} cy={irisY} r={irisR} fill={colour.iris} />
        <circle
          cx={0} cy={irisY} r={irisR} fill="none"
          stroke={colour.limbal} strokeWidth={irisR * 0.24}
        />
        <circle cx={0} cy={irisY + irisR * 0.22} r={irisR * 0.62} fill={colour.iris} opacity={0.55} />
        <circle cx={0} cy={irisY} r={irisR * 0.40} fill="#0f0b09" />
        {detail > 0.4 && (
          <circle
            cx={-irisR * 0.36} cy={irisY - irisR * 0.36} r={irisR * 0.18}
            fill="#ffffff" opacity={0.8}
          />
        )}
        {/* the upper lid's shadow, sitting on the eyeball rather than over it */}
        <ellipse
          cx={0} cy={-h * (spec.upperRise + 0.55)} rx={w * 1.3} ry={h * 0.72}
          fill="#241a14" opacity={0.18 + spec.hood * 0.14}
        />
      </g>
      <path d={upper} fill="none" stroke={skin.edge} strokeWidth={lash} strokeLinecap="round" />
      <path
        d={lower} fill="none" stroke={skin.line} strokeWidth={Math.max(0.8, lash * 0.30)}
        strokeLinecap="round" opacity={0.5}
      />
      {detail > 0.45 && spec.crease > 0.05 && (
        <path
          d={openPath([
            pt(-w * 0.78, spec.innerY * h - h * spec.crease * 0.55),
            pt(-w * 0.1, -h * (spec.upperRise + spec.crease) * 0.96),
            pt(w * 0.86, spec.outerY * h - h * spec.crease * 0.72),
          ], 0.9)}
          fill="none" stroke={skin.line} strokeWidth={Math.max(0.7, h * 0.05)}
          opacity={0.34} strokeLinecap="round"
        />
      )}
      <path
        d={`M${String(-w)},${String(spec.innerY * h)} l${String(-w * 0.14)},${String(h * 0.12)} l${String(w * 0.18)},${String(h * 0.05)} Z`}
        fill={skin.deep} opacity={0.5}
      />
    </g>
  );
}

/** How deep the complexion is, recovered from the palette. Only the sclera
 *  needs it, and threading pigment through every family for one value is worse
 *  than reading it back here. */
function pigmentOf(ctx: DrawContext): number {
  const n = ctx.skin.base.replace('#', '');
  const l = (parseInt(n.slice(0, 2), 16) + parseInt(n.slice(2, 4), 16) + parseInt(n.slice(4, 6), 16)) / 765;
  return clamp(1 - l, 0, 1);
}

export function Eyes({ ctx, id }: { readonly ctx: DrawContext; readonly id: string }) {
  const spec = eyeSpec(id);
  const { layout, morph } = ctx;
  const [leftColour, rightColour] = heterochromicPair(ctx.eyeColor);
  const w = layout.eyeSize / 2;
  const h = w * 2 * spec.ratio;
  const dx = layout.eyeSpan / 2;
  const tilt = clamp(morph.eyeAngle, -1, 1) * 7;
  const asymY = clamp(morph.asymEye, -1, 1) * h * 0.10;

  return (
    <Fragment>
      {[-1, 1].map((side) => (
        <g
          key={side}
          transform={`translate(${String(layout.cx + dx * side)},${String(layout.eyeY + (side > 0 ? asymY : 0))}) scale(${String(side)},1) rotate(${String(tilt)})`}
        >
          <OneEye
            ctx={ctx} spec={spec} w={w} h={h} side={side}
            colour={side < 0 ? leftColour : rightColour}
          />
        </g>
      ))}
    </Fragment>
  );
}
