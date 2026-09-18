// What makes hair look like hair.
//
// A silhouette on its own is a helmet, which the brief names as the thing to
// avoid, and it is right: the difference between "hair" and "a shape the
// colour of hair" is almost entirely surface. Each family gets the treatment
// its real-world construction actually has -- waves get curved rows following
// the skull, locs get separate rounded strands, cornrows get visible parts
// between directional rows, curls get clustered silhouettes that break the
// outer edge.
//
// Everything is deterministic: scattered elements come from a stream seeded on
// the player, never from Math.random, so a portrait does not reshuffle its
// curls when React re-renders it.

import { Fragment } from 'react';
import { openPath, pt } from '../geom';
import type { HairPalette } from '../palette';
import type { FaceLayout } from '../layout';
import { stream, type HairOutline } from './outline';
import type { HairStyle } from './styles';
import { BraidedRows, SweptLocks } from './Locks';

export interface TextureProps {
  readonly l: FaceLayout;
  readonly style: HairStyle;
  readonly out: HairOutline;
  readonly p: HairPalette;
  readonly uid: string;
  readonly seed: string;
  readonly detail: number;
  readonly scalp: string;
}

/** Points spread over the mass, respecting its width at each height. */
function scatter(t: TextureProps, count: number, spreadY = 1): { x: number; y: number; r: number }[] {
  const rnd = stream(`${t.seed}:${t.style.id}:scatter`);
  const out: { x: number; y: number; r: number }[] = [];
  // Bounded above the fade line. Clusters allowed to wander down the side of
  // the head turn into ear muffs, which is what the first pass produced.
  const floor = Math.min(t.out.endY, t.l.crownY + t.l.faceH * (t.style.fadeT + t.style.fall));
  for (let i = 0; i < count; i += 1) {
    const y = t.out.topY + (floor - t.out.topY) * Math.pow(rnd(), 1 / spreadY);
    const half = t.out.halfAt(y);
    const x = t.l.cx + (rnd() * 2 - 1) * half;
    out.push({ x, y, r: rnd() });
  }
  return out;
}

/** Curved rows following the skull. Waves, and the base for cornrows. */
function rows(t: TextureProps, count: number, zigzag: boolean): string[] {
  const paths: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const k = i / (count + 1);
    const y = t.out.topY + (t.out.endY - t.out.topY) * k * 0.86;
    const half = t.out.halfAt(y);
    const dip = t.l.faceH * (zigzag ? 0.018 : 0.030) * (1 - k);
    paths.push(openPath([
      pt(t.l.cx - half * 1.02, y + dip * 1.4),
      pt(t.l.cx - half * 0.5, y - dip * (zigzag && i % 2 === 0 ? -0.6 : 1)),
      pt(t.l.cx, y - dip * 1.15),
      pt(t.l.cx + half * 0.5, y - dip * (zigzag && i % 2 === 0 ? -0.6 : 1)),
      pt(t.l.cx + half * 1.02, y + dip * 1.4),
    ], 0.95));
  }
  return paths;
}

function Clusters({ t, count, size, edge }: {
  readonly t: TextureProps; readonly count: number; readonly size: number; readonly edge: boolean;
}) {
  const pts = scatter(t, count, 1.2);
  const r0 = t.l.faceH * size;
  return (
    <Fragment>
      {edge && pts.slice(0, Math.round(count * 0.55)).map((s, i) => {
        // Pushed to the boundary so the silhouette itself breaks up.
        const half = t.out.halfAt(s.y);
        const dir = s.x > t.l.cx ? 1 : -1;
        return (
          <circle
            key={`e${String(i)}`} cx={t.l.cx + dir * half * (0.86 + s.r * 0.22)} cy={s.y}
            r={r0 * (0.7 + s.r * 0.6)} fill={t.p.base}
          />
        );
      })}
      {pts.map((s, i) => {
        const r = r0 * (0.55 + s.r * 0.75);
        return <g key={`c${i}`} transform={`translate(${s.x},${s.y}) rotate(${s.r * 160 - 80})`}>
          <path d={`M${-r},0 C${-r},${-r} ${r * 0.8},${-r * 1.2} ${r},${-r * 0.2}
            C${r * 1.2},${r * 0.6} ${-r * 0.1},${r} ${-r * 0.55},${r * 0.3} Z`}
            fill={i % 3 === 0 ? t.p.shadow : t.p.base} />
          <path d={`M${-r * 0.8},${r * 0.1} C${-r * 0.9},${-r * 0.7} ${r * 0.7},${-r * 0.8} ${r * 0.65},0
            C${r * 0.6},${r * 0.5} ${-r * 0.2},${r * 0.45} ${-r * 0.1},0`}
            fill="none" stroke={t.p.light} strokeWidth={Math.max(0.6, r * 0.12)}
            strokeLinecap="round" opacity={0.40} />
        </g>;
      })}
    </Fragment>
  );
}

function Strands({ t, count, vertical, length }: {
  readonly t: TextureProps; readonly count: number; readonly vertical: boolean; readonly length: number;
}) {
  const rnd = stream(`${t.seed}:${t.style.id}:strand`);
  const w = t.l.faceH * 0.026;
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const k = (i + 0.5) / count;
    const spanY = t.out.hairlineY - t.out.topY;
    const startY = t.out.topY + spanY * (0.08 + Math.abs(k - 0.5) * 0.5);
    const half = t.l.halfAt(t.out.hairlineY);
    const x = t.l.cx + (k * 2 - 1) * half * 0.42;
    const jitter = (rnd() * 2 - 1);
    const endY = t.out.hairlineY + t.l.faceH * (vertical ? 0.025 : -0.015) * (1 + length);
    const endX = t.l.cx + (k * 2 - 1) * half * 0.96;
    const bend = (k * 2 - 1) * half * 0.4 + jitter * t.l.faceH * 0.025;
    const d = `M${x},${startY} C${x + bend},${startY - t.l.faceH * 0.045}
      ${endX + bend * 0.25},${endY - spanY * 0.4} ${endX},${endY}`;
    items.push(
      <g key={i}>
        <path
          d={d} fill="none" stroke={t.p.shadow} strokeWidth={w * 1.3} strokeLinecap="round"
        />
        <path
          d={d} fill="none" stroke={t.p.base} strokeWidth={w * 0.85} strokeLinecap="round"
        />
        <path d={d} fill="none" stroke={t.p.light} strokeWidth={w * 0.16}
          strokeLinecap="round" opacity={0.6} strokeDasharray="5 2" />
      </g>,
    );
  }
  return <Fragment>{items}</Fragment>;
}

export function HairTexture(t: TextureProps) {
  const { style, p, l, detail } = t;
  const line = Math.max(0.9, l.faceH * 0.011);

  switch (style.family) {
    case 'cornrows':
    case 'braids':
      return <BraidedRows t={t} />;
    case 'waves': {
      const count = 7;
      const zig = style.id === 'cornrows-zigzag';
      return (
        <g>
          {rows(t, count, zig).map((d, i) => (
            <Fragment key={i}>
              <path
                d={d} fill="none" stroke={p.shadow}
                strokeWidth={line * 1.5}
                strokeLinecap="round" opacity={0.55}
              />
              <path
                d={d} fill="none" stroke={p.light} strokeWidth={line * 0.7}
                strokeLinecap="round" opacity={0.22}
                transform={`translate(0,${String(-line * 1.4)})`}
              />
            </Fragment>
          ))}
        </g>
      );
    }
    case 'curls':
      return <Clusters t={t} count={detail > 0.5 ? 80 : 24} size={0.030} edge={false} />;
    case 'afro':
      return <Clusters t={t} count={detail > 0.5 ? 105 : 28} size={0.029} edge={false} />;
    case 'twists':
      return <Strands t={t} count={detail > 0.5 ? 16 : 9} vertical={false} length={style.fall * 2} />;
    case 'locs':
      return <Strands t={t} count={detail > 0.5 ? 13 : 8} vertical length={style.fall * 2} />;
    case 'buzz':
    case 'fade':
    case 'skin': {
      const dots = scatter(t, detail > 0.5 ? 90 : 26, 1.1);
      return (
        <g opacity={style.family === 'skin' ? 0.35 : 0.6}>
          {dots.map((s, i) => (
            <circle
              key={i} cx={s.x} cy={s.y} r={Math.max(0.5, l.faceH * 0.0055 * (0.6 + s.r))}
              fill={i % 4 === 0 ? p.light : p.shadow}
            />
          ))}
        </g>
      );
    }
    case 'sweep':
    case 'long':
    case 'crop':
    default:
      return <SweptLocks t={t} />;
  }
}
