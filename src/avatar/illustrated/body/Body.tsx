// Neck, traps, shoulders, jersey.
//
// The brief is specific that the difference between a receiver and a lineman
// should be visible in a head-and-shoulders portrait, and it is: the neck is
// wider, the trapezius climbs higher toward the ear, and the shoulders leave
// the frame further out. All three come from the build the existing system
// already assigns by position, so nothing new decides it here.

import { closedPath, clamp, pt, type Pt } from '../geom';
import { VIEW_H, VIEW_W } from '../layout';
import type { DrawContext } from '../types';

export interface BodyProps {
  readonly ctx: DrawContext;
  readonly shirt: string;
  readonly collar: string;
}

function metrics(ctx: DrawContext) {
  const { layout: l, morph } = ctx;
  // Relative to the jaw rather than absolute, so a narrow face does not get a
  // neck wider than its own chin.
  // Measured where the jaw is still wide, not down at the chin: taken at the
  // chin the neck comes out as a stalk on every narrow face.
  const jawHalf = l.halfAt(l.chinY - l.faceH * 0.22);
  const neckHalf = jawHalf * (0.86 + clamp(morph.neckWidth, -1, 1) * 0.15);
  const shoulderHalf = l.faceH * (0.70 + clamp(morph.shoulderWidth, -1, 1) * 0.22);
  const trapRise = l.faceH * (0.070 + clamp(morph.trapSize, -1, 1) * 0.048);
  const neckTop = l.chinY - l.faceH * 0.12;
  // A head-and-shoulders crop has a short neck. The first attempt put this a
  // third of a face below the chin, which pushed the collar off the frame and
  // left twenty players standing on a stalk.
  // Close under the chin. A head-and-shoulders crop shows very little neck,
  // and the first attempt at this left every player on a long column.
  const shoulderY = l.chinY + l.faceH * 0.035;
  return { neckHalf, shoulderHalf, trapRise, neckTop, shoulderY };
}

/** Behind the head. */
export function Neck({ ctx }: { readonly ctx: DrawContext }) {
  const { layout: l, skin, uid } = ctx;
  const { neckHalf, neckTop, shoulderY } = metrics(ctx);
  const d = closedPath([
    pt(l.cx - neckHalf * 0.88, neckTop),
    pt(l.cx - neckHalf, shoulderY - l.faceH * 0.03),
    pt(l.cx - neckHalf * 1.14, shoulderY + l.faceH * 0.10),
    pt(l.cx + neckHalf * 1.14, shoulderY + l.faceH * 0.10),
    pt(l.cx + neckHalf, shoulderY - l.faceH * 0.03),
    pt(l.cx + neckHalf * 0.88, neckTop),
  ], 0.8);
  return (
    <g>
      <path d={d} fill={skin.soft} />
      {/* The neck is in shadow all the way down. The first pass let it fade
          back to full skin at the bottom, which made it read as a separate,
          brighter object bolted under the chin. */}
      <path d={d} fill={`url(#${uid}-neck)`} />
      <path
        d={closedPath([
          pt(l.cx - neckHalf * 0.9, neckTop),
          pt(l.cx, neckTop + l.faceH * 0.085),
          pt(l.cx + neckHalf * 0.9, neckTop),
          pt(l.cx, neckTop - l.faceH * 0.02),
        ], 1.05)}
        fill={skin.deep} opacity={0.5}
      />
    </g>
  );
}

/** In front of the neck, after the face is drawn. */
export function Jersey({ ctx, shirt, collar }: BodyProps) {
  const { layout: l } = ctx;
  const { neckHalf, shoulderHalf, trapRise, shoulderY } = metrics(ctx);
  const collarY = shoulderY;

  /* The shoulder line, from the neck out to the frame edge. Sampled once and
     used three times -- the jersey, the collar band and the plane change all
     have to sit on the same curve or the trim floats. */
  const shoulder = (dir: number, lift: number): Pt[] => [
    pt(l.cx + dir * neckHalf * 1.10, collarY + lift),
    pt(l.cx + dir * (neckHalf + (shoulderHalf - neckHalf) * 0.44), collarY + trapRise * 0.34 + lift),
    pt(l.cx + dir * shoulderHalf * 0.94, collarY + trapRise * 1.05 + lift),
    pt(l.cx + dir * shoulderHalf, VIEW_H),
  ];

  const body = closedPath([
    ...[...shoulder(-1, 0)].reverse(),
    pt(l.cx, collarY + l.faceH * 0.085),
    ...shoulder(1, 0),
  ], 0.92);

  /* The light collar. It is the one bright element in the reference's
     presentation and it does a surprising amount of work: without it the
     portrait ends in an undifferentiated dark mass. */
  const trim = (dir: number): string => {
    const outer = shoulder(dir, 0);
    const inner = shoulder(dir, l.faceH * 0.032);
    return closedPath([...outer.slice(0, 3), ...[...inner.slice(0, 3)].reverse()], 0.92);
  };

  return (
    <g>
      <path d={body} fill={shirt} />
      {/* one plane change where the shoulder turns away */}
      <path
        d={closedPath([
          pt(l.cx - shoulderHalf, VIEW_H),
          pt(l.cx - shoulderHalf * 0.94, collarY + trapRise * 1.05),
          pt(l.cx - shoulderHalf * 0.50, collarY + trapRise * 1.5),
          pt(l.cx - shoulderHalf * 0.56, VIEW_H),
        ], 1.0)}
        fill="#000000" opacity={0.14}
      />
      {[-1, 1].map((dir) => (
        <path key={dir} d={trim(dir)} fill={collar} opacity={dir > 0 ? 0.88 : 1} />
      ))}
      {/* the neckline itself, dark, cut into the collar */}
      <path
        d={closedPath([
          pt(l.cx - neckHalf * 1.12, collarY - l.faceH * 0.006),
          pt(l.cx, collarY + l.faceH * 0.095),
          pt(l.cx + neckHalf * 1.12, collarY - l.faceH * 0.006),
          pt(l.cx, collarY + l.faceH * 0.045),
        ], 1.0)}
        fill={shirt}
      />
      <path d={`M0,0 H${String(VIEW_W)} V0 H0 Z`} fill="none" />
    </g>
  );
}
