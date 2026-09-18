// Two lips and a seam.
//
// Built as three curves -- the top edge of the upper lip, the seam, the bottom
// edge of the lower lip -- and filled as two shapes between them. That is the
// difference between a mouth and a mouth line: the upper lip can be thin under
// a full lower one, the cupid's bow can be pronounced or flat, and the corners
// can sit above or below the seam, none of which a single stroke can express.

import { closedPath, clamp, nudge, openPath, pt, type Pt } from '../geom';
import { shade } from '../palette';
import type { DrawContext } from '../types';
import { mouthSpec } from './constructions';

export function Mouth({ ctx, id }: { readonly ctx: DrawContext; readonly id: string }) {
  const spec = mouthSpec(id);
  const { layout, skin, morph, detail } = ctx;

  const hw = (layout.mouthWidth * spec.width) / 2;
  const upper = spec.upper * hw * 1.55 * nudge(morph.upperLip, 0.35);
  const lower = spec.lower * hw * 1.55 * nudge(morph.lowerLip, 0.35);
  const bow = spec.bow * nudge(morph.cupidBow, 0.5);
  const pk = spec.peaks * hw;
  const corner = spec.corner * hw + clamp(morph.mouthCorner, -1, 1) * hw * 0.06;
  const seamY = spec.seam * hw * 0.22;
  const asym = clamp(morph.asymMouth, -1, 1) * hw * 0.035;

  const topEdge: Pt[] = [
    pt(-hw, corner),
    pt(-pk * 1.55, -upper * 0.52),
    pt(-pk, -upper),
    pt(0, -upper * (1 - bow * 0.55)),
    pt(pk, -upper + asym * 0.4),
    pt(pk * 1.55, -upper * 0.52),
    pt(hw, corner + asym),
  ];
  const seam: Pt[] = [
    pt(-hw, corner),
    pt(-hw * 0.46, seamY * 0.72),
    pt(0, seamY),
    pt(hw * 0.46, seamY * 0.72),
    pt(hw, corner + asym),
  ];
  const bottomEdge: Pt[] = [
    pt(-hw, corner),
    pt(-hw * 0.52, lower * 0.82),
    pt(0, lower * (0.86 + spec.fullness * 0.32)),
    pt(hw * 0.52, lower * 0.82),
    pt(hw, corner + asym),
  ];

  const upperShape = closedPath([...topEdge, ...[...seam].reverse()], 0.92);
  const lowerShape = closedPath([...seam, ...[...bottomEdge].reverse()], 0.95);
  const seamPath = openPath(seam, 0.92);

  /* The upper lip faces down and the lower faces up, so they are never the
     same colour. Getting this backwards is what makes a mouth look pasted on. */
  const upperFill = shade(skin.lip, -0.10);
  const lowerFill = shade(skin.lip, 0.05);

  return (
    <g transform={`translate(${String(layout.cx)},${String(layout.mouthY)})`}>
      {/* the shadow the lower lip casts onto the chin */}
      <path
        d={closedPath([
          pt(-hw * 0.78, lower * 0.9), pt(0, lower * (1.30 + spec.fullness * 0.3)),
          pt(hw * 0.78, lower * 0.9), pt(0, lower * 0.8),
        ], 1.05)}
        fill={skin.deep} opacity={0.20}
      />
      <path d={upperShape} fill={upperFill} />
      <path d={lowerShape} fill={lowerFill} />
      {detail > 0.4 && (
        <path
          d={openPath([
            pt(-hw * 0.42, lower * 0.30),
            pt(0, lower * (0.42 + spec.fullness * 0.18)),
            pt(hw * 0.42, lower * 0.30),
          ], 0.95)}
          fill="none" stroke={shade(skin.lip, 0.22)}
          strokeWidth={Math.max(1, lower * 0.26)} strokeLinecap="round" opacity={0.45}
        />
      )}
      <path
        d={seamPath} fill="none" stroke={skin.line}
        strokeWidth={Math.max(1.2, hw * 0.045)} strokeLinecap="round" opacity={0.9}
      />
      {/* corners: a short darker mark, or the mouth ends in mid-air */}
      {[-1, 1].map((dir) => (
        <circle
          key={dir} cx={dir * hw * 0.97} cy={corner + (dir > 0 ? asym : 0)}
          r={Math.max(0.8, hw * 0.035)} fill={skin.edge} opacity={0.55}
        />
      ))}
      {detail > 0.55 && spec.philtrum > 0 && (
        <g opacity={0.30}>
          {[-1, 1].map((dir) => (
            <path
              key={dir}
              d={openPath([
                pt(dir * spec.philtrum * hw, -upper * 1.05),
                pt(dir * spec.philtrum * hw * 1.15, -upper * 2.0),
              ], 1)}
              fill="none" stroke={skin.line} strokeWidth={Math.max(0.7, hw * 0.022)}
              strokeLinecap="round"
            />
          ))}
        </g>
      )}
    </g>
  );
}
