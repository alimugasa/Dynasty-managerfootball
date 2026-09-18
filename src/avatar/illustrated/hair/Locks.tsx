// Directional locks and edge details for the existing hairstyle families.
// All placement uses the renderer's seed stream, never a new identity trait.
import { Fragment } from 'react';
import { stream } from './outline';
import type { TextureProps } from './texture';

export function BraidedRows({ t }: { readonly t: TextureProps }) {
  const { l, out, p, scalp, style } = t;
  const half = l.halfAt(out.hairlineY) * 0.88;
  const width = l.faceH * 0.026;
  return <g>
    {Array.from({ length: 9 }, (_, i) => {
      const k = (i - 4) / 4;
      const x = l.cx + k * half;
      const y = out.hairlineY - Math.abs(k) * l.faceH * 0.04;
      const topX = l.cx + k * half * 0.34;
      const bend = style.id === 'cornrows-zigzag' ? Math.sin(i * 2) * width : 0;
      const d = `M${x},${y} C${x + bend},${y - l.faceH * 0.10}
        ${topX},${out.topY + l.faceH * 0.03} ${topX},${out.topY - width}`;
      return <g key={i}>
        <path d={d} fill="none" stroke={scalp} strokeWidth={width * 1.65} opacity={0.70} />
        <path d={d} fill="none" stroke={p.shadow} strokeWidth={width * 1.1} strokeLinecap="round" />
        <path d={d} fill="none" stroke={p.light} strokeWidth={width * 0.32}
          strokeDasharray={`${width * 0.6} ${width * 0.42}`} opacity={0.65} />
      </g>;
    })}
  </g>;
}

export function SweptLocks({ t }: { readonly t: TextureProps }) {
  const { l, out, p, style, detail } = t;
  const rnd = stream(`${t.seed}:${style.id}:sweep`);
  const half = l.halfAt(out.hairlineY);
  const dir = style.part >= 0 ? 1 : -1;
  const n = detail > 0.5 ? 22 : 10;
  const items = [];
  for (let i = 0; i < n; i += 1) {
    const k = (i + 0.5) / n;
    const x = l.cx + dir * half * (0.65 - k * 1.6);
    const y = out.hairlineY + (rnd() - 0.5) * l.faceH * 0.032;
    const topX = l.cx + dir * half * (0.65 - k * 1.4);
    const topY = out.topY + l.faceH * (0.025 + k * 0.12);
    const d = `M${x},${y} C${x + dir * half * 0.5},${y - l.faceH * 0.10}
      ${topX - dir * half * 0.4},${topY - l.faceH * 0.04} ${topX},${topY}`;
    items.push(<g key={i}>
      <path d={d} fill="none" stroke={i % 3 === 0 ? p.shadow : p.base}
        strokeWidth={l.faceH * 0.017} strokeLinecap="round" />
      <path d={d} fill="none" stroke={p.light} strokeWidth={l.faceH * 0.0035}
        strokeLinecap="round" opacity={0.50} />
    </g>);
  }
  return <g>{items}</g>;
}

export function EdgeTufts(t: TextureProps) {
  const { l, style, out, p } = t;
  if (!['curls', 'afro', 'crop', 'sweep'].includes(style.family) || style.id === 'flat-top') return null;
  const curly = style.family === 'curls' || style.family === 'afro';
  const rnd = stream(`${t.seed}:${style.id}:edge-tufts`);
  const points = out.outer.filter((point) => point.y < out.hairlineY);
  return <g>{[-1, 1].map((side) => points.map((point, i) => {
    const x = l.cx + side * (point.x - l.cx);
    const r = l.faceH * (curly ? 0.025 : 0.017) * (0.7 + rnd() * 0.5);
    const y = point.y;
    return <Fragment key={`${side}:${i}`}>
      <path d={curly
        ? `M${x - r},${y + r} C${x - r * 1.6},${y - r} ${x + r},${y - r * 1.5} ${x + r},${y} L${x},${y + r} Z`
        : `M${x - r},${y + r} Q${x + side * r * 1.8},${y - r * 2} ${x + side * r},${y - r} L${x + r},${y + r} Z`}
        fill={p.base} />
      <path d={`M${x - r * 0.5},${y} Q${x},${y - r} ${x + r * 0.5},${y - r * 0.4}`}
        stroke={p.light} strokeWidth={l.faceH * 0.003} fill="none" opacity={0.4} />
    </Fragment>;
  }))}</g>;
}

/** Separate hanging locks behind the ears, with visible gaps at their tips. */
export function HangingLocks({ t }: { readonly t: TextureProps }) {
  const { l, out, p, style } = t;
  const rnd = stream(`${t.seed}:${style.id}:hanging`);
  const width = l.faceH * (style.family === 'braids' ? 0.021 : 0.028);
  return <g>{[-1, 1].flatMap((side) => Array.from({ length: 6 }, (_, i) => {
    const k = i / 5;
    const x = l.cx + side * l.halfAt(l.eyeY) * (0.83 + k * 0.22);
    const y = l.crownY + l.faceH * (0.14 + k * 0.10);
    const end = out.endY + l.faceH * (0.035 + rnd() * 0.06);
    const bend = side * l.faceH * (0.02 + rnd() * 0.03);
    const d = `M${x},${y} C${x + bend},${l.eyeY} ${x + bend * 1.2},${end - l.faceH * 0.13} ${x + bend * 0.7},${end}`;
    return <g key={`${side}:${i}`}>
      <path d={d} fill="none" stroke={p.shadow} strokeWidth={width * 1.25} strokeLinecap="round" />
      <path d={d} fill="none" stroke={p.base} strokeWidth={width * 0.82} strokeLinecap="round" />
      <path d={d} fill="none" stroke={p.light} strokeWidth={width * 0.15} opacity={0.6}
        strokeDasharray={style.family === 'braids' ? '2 2' : '5 1'} />
    </g>;
  }))}</g>;
}
