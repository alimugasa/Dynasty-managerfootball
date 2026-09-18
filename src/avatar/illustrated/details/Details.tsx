// The small things.
//
// Freckles, a mole, a scar through an eyebrow, the lines a thirty-six-year-old
// has and a rookie does not. The brief's own warning is the important part --
// do not overuse them -- so every one of these is low opacity, most players
// have none, and nothing here changes the shape of anything.
//
// Age lines are separate from complexion and are gated on the player's actual
// age, because a twenty-two-year-old with forehead lines reads as a mistake
// rather than as a detail.

import { Fragment } from 'react';
import { clamp, lerp, openPath, pt } from '../geom';
import { shade } from '../palette';
import type { DrawContext } from '../types';
import { stream } from '../hair/outline';

function Freckles({ ctx, count, spread }: {
  readonly ctx: DrawContext; readonly count: number; readonly spread: number;
}) {
  const l = ctx.layout;
  const rnd = stream(`${ctx.seed}:freckle`);
  const dots = [];
  for (let i = 0; i < count; i += 1) {
    const y = lerp(l.eyeY + l.faceH * 0.02, l.noseBaseY + l.faceH * 0.02, rnd());
    const half = l.halfAt(y);
    const x = l.cx + (rnd() * 2 - 1) * half * spread;
    if (Math.abs(x - l.cx) < l.noseWidth * 0.5 && y > l.eyeY) continue;
    dots.push(
      <circle
        key={i} cx={x} cy={y} r={Math.max(0.5, l.faceH * 0.0042 * (0.7 + rnd() * 0.8))}
        fill={shade(ctx.skin.base, -0.34)}
      />,
    );
  }
  return <g opacity={0.5}>{dots}</g>;
}

function Line({ ctx, from, to, mid, width, opacity }: {
  readonly ctx: DrawContext;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly mid: readonly [number, number];
  readonly width: number;
  readonly opacity: number;
}) {
  return (
    <path
      d={openPath([pt(from[0], from[1]), pt(mid[0], mid[1]), pt(to[0], to[1])], 0.95)}
      fill="none" stroke={ctx.skin.line} strokeWidth={width}
      strokeLinecap="round" opacity={opacity}
    />
  );
}

export function AgeLines({ ctx }: { readonly ctx: DrawContext }) {
  const l = ctx.layout;
  const wear = clamp(ctx.wear, 0, 1);
  // Rarer and fainter than the first two attempts. At any strength that is
  // actually visible across a grid, forehead lines stop reading as age and
  // start reading as scars -- which is exactly how they read at 0.24.
  if (ctx.age < 33 || wear < 0.5 || ctx.detail < 0.6) return null;
  const w = Math.max(0.7, l.faceH * 0.0055);
  const browTop = l.browY - l.faceH * 0.055;
  const half = l.halfAt(browTop);
  return (
    <g opacity={0.05 + wear * 0.07}>
      {[0, 1].map((i) => (
        <Line
          key={i} ctx={ctx}
          from={[l.cx - half * 0.56, browTop - l.faceH * i * 0.030]}
          mid={[l.cx, browTop - l.faceH * (0.012 + i * 0.030)]}
          to={[l.cx + half * 0.56, browTop - l.faceH * i * 0.030]}
          width={w} opacity={1 - i * 0.35}
        />
      ))}
      {/* the fold from the nose to the corner of the mouth, both sides */}
      {[-1, 1].map((dir) => (
        <Line
          key={`n${dir}`} ctx={ctx}
          from={[l.cx + dir * l.noseWidth * 0.56, l.noseBaseY - l.faceH * 0.012]}
          mid={[l.cx + dir * l.noseWidth * 0.86, l.mouthY - l.faceH * 0.028]}
          to={[l.cx + dir * l.mouthWidth * 0.60, l.mouthY + l.faceH * 0.012]}
          width={w * 1.1} opacity={dir > 0 ? 1 : 0.75}
        />
      ))}
    </g>
  );
}

/** Complexion, from the trait the identity already stores. */
export function Complexion({ ctx, id }: { readonly ctx: DrawContext; readonly id: string }) {
  const l = ctx.layout;
  const w = Math.max(0.8, l.faceH * 0.006);
  const dark = shade(ctx.skin.base, -0.40);

  switch (id) {
    case 'freckles-light': return <Freckles ctx={ctx} count={26} spread={0.82} />;
    case 'freckles-heavy': return <Freckles ctx={ctx} count={62} spread={0.90} />;
    case 'freckles-cheeks': return <Freckles ctx={ctx} count={34} spread={0.94} />;
    case 'acne-scarring': return <Freckles ctx={ctx} count={22} spread={0.95} />;
    case 'dry-skin': return <Freckles ctx={ctx} count={16} spread={0.88} />;
    case 'mole-cheek':
      return <circle cx={l.cx + l.halfAt(l.eyeY) * 0.52} cy={l.eyeY + l.faceH * 0.09} r={l.faceH * 0.008} fill={dark} />;
    case 'mole-lip':
      return <circle cx={l.cx - l.mouthWidth * 0.42} cy={l.mouthY - l.faceH * 0.028} r={l.faceH * 0.007} fill={dark} />;
    case 'mole-brow':
      return <circle cx={l.cx + l.eyeSize * 0.7} cy={l.browY - l.faceH * 0.028} r={l.faceH * 0.007} fill={dark} />;
    case 'scar-brow':
      return (
        <Line
          ctx={ctx} from={[l.cx + l.eyeSize * 0.42, l.browY - l.faceH * 0.028]}
          mid={[l.cx + l.eyeSize * 0.52, l.browY]}
          to={[l.cx + l.eyeSize * 0.60, l.browY + l.faceH * 0.020]} width={w * 1.4} opacity={0.55}
        />
      );
    case 'scar-cheek':
      return (
        <Line
          ctx={ctx} from={[l.cx - l.halfAt(l.eyeY) * 0.62, l.eyeY + l.faceH * 0.06]}
          mid={[l.cx - l.halfAt(l.eyeY) * 0.52, l.eyeY + l.faceH * 0.105]}
          to={[l.cx - l.halfAt(l.eyeY) * 0.46, l.eyeY + l.faceH * 0.15]} width={w * 1.3} opacity={0.5}
        />
      );
    case 'scar-lip':
      return (
        <Line
          ctx={ctx} from={[l.cx + l.mouthWidth * 0.20, l.mouthY - l.faceH * 0.040]}
          mid={[l.cx + l.mouthWidth * 0.24, l.mouthY - l.faceH * 0.018]}
          to={[l.cx + l.mouthWidth * 0.22, l.mouthY]} width={w * 1.3} opacity={0.5}
        />
      );
    case 'scar-chin':
      return (
        <Line
          ctx={ctx} from={[l.cx - l.faceH * 0.03, l.chinY - l.faceH * 0.055]}
          mid={[l.cx - l.faceH * 0.01, l.chinY - l.faceH * 0.040]}
          to={[l.cx + l.faceH * 0.02, l.chinY - l.faceH * 0.032]} width={w * 1.3} opacity={0.5}
        />
      );
    case 'birthmark-temple':
      return (
        <ellipse
          cx={l.cx - l.halfAt(l.browY) * 0.80} cy={l.browY - l.faceH * 0.02}
          rx={l.faceH * 0.026} ry={l.faceH * 0.020} fill={dark} opacity={0.30}
        />
      );
    case 'vitiligo-patch':
      return (
        <ellipse
          cx={l.cx + l.halfAt(l.noseBaseY) * 0.58} cy={l.noseBaseY}
          rx={l.faceH * 0.045} ry={l.faceH * 0.032}
          fill={shade(ctx.skin.base, 0.34)} opacity={0.55}
        />
      );
    case 'under-eye-shadow':
      return (
        <Fragment>
          {[-1, 1].map((dir) => (
            <ellipse
              key={dir} cx={l.cx + dir * (l.eyeSpan / 2)} cy={l.eyeY + l.eyeSize * 0.52}
              rx={l.eyeSize * 0.52} ry={l.eyeSize * 0.24}
              fill={ctx.skin.deep} opacity={0.34}
            />
          ))}
        </Fragment>
      );
    case 'dimples':
      return (
        <Fragment>
          {[-1, 1].map((dir) => (
            <Line
              key={dir} ctx={ctx}
              from={[l.cx + dir * l.mouthWidth * 0.66, l.mouthY - l.faceH * 0.02]}
              mid={[l.cx + dir * l.mouthWidth * 0.72, l.mouthY + l.faceH * 0.005]}
              to={[l.cx + dir * l.mouthWidth * 0.64, l.mouthY + l.faceH * 0.030]}
              width={w} opacity={0.34}
            />
          ))}
        </Fragment>
      );
    case 'ruddy':
      return (
        <Fragment>
          {[-1, 1].map((dir) => (
            <ellipse
              key={dir} cx={l.cx + dir * l.halfAt(l.eyeY) * 0.58} cy={l.eyeY + l.faceH * 0.085}
              rx={l.faceH * 0.075} ry={l.faceH * 0.050}
              fill="#b5503c" opacity={0.14}
            />
          ))}
        </Fragment>
      );
    case 'sun-weathered':
      return <g opacity={0.5}><AgeLines ctx={{ ...ctx, age: 34, wear: 0.6 }} /></g>;
    default:
      return null;
  }
}

/** The eight accessories the identity system stores. */
export function Accessory({ ctx, id }: { readonly ctx: DrawContext; readonly id: string }) {
  const l = ctx.layout;
  switch (id) {
    case 'eye-black':
      return (
        <Fragment>
          {[-1, 1].map((dir) => (
            <rect
              key={dir} x={l.cx + dir * (l.eyeSpan / 2) - l.eyeSize * 0.38}
              y={l.eyeY + l.eyeSize * 0.42} width={l.eyeSize * 0.76} height={l.eyeSize * 0.34}
              rx={l.eyeSize * 0.06} fill="#16120f" opacity={0.86}
            />
          ))}
        </Fragment>
      );
    case 'headband':
      return (
        <path
          d={`M${String(l.cx - l.halfAt(l.browY - l.faceH * 0.10) * 1.02)},${String(l.browY - l.faceH * 0.10)}
              h${String(l.halfAt(l.browY - l.faceH * 0.10) * 2.04)} v${String(-l.faceH * 0.055)}
              h${String(-l.halfAt(l.browY - l.faceH * 0.10) * 2.04)} Z`}
          fill="#2b3440"
        />
      );
    case 'nose-stud':
      return (
        <circle
          cx={l.cx - l.noseWidth * 0.48} cy={l.noseBaseY - l.faceH * 0.014}
          r={l.faceH * 0.007} fill="#d8d2c4"
        />
      );
    case 'tape-bridge':
      return (
        <rect
          x={l.cx - l.noseWidth * 0.30} y={l.noseBaseY - l.faceH * 0.105}
          width={l.noseWidth * 0.60} height={l.faceH * 0.050}
          rx={l.faceH * 0.012} fill="#e7e0d2" opacity={0.9}
        />
      );
    case 'earrings':
      return (
        <Fragment>
          {[-1, 1].map((dir) => (
            <circle
              key={dir} cx={l.cx + dir * (l.halfAt(l.earY) + l.earHeight * 0.10)}
              cy={l.earY + l.earHeight * 0.44} r={l.faceH * 0.011} fill="#ddd2ae"
            />
          ))}
        </Fragment>
      );
    default:
      return null;
  }
}
