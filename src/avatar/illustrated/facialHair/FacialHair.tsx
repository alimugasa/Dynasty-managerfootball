// Beards, drawn under the mouth.
//
// Layer order does the hard part. A beard region that covers the whole lower
// face is exactly a full beard once the lips are drawn on top of it -- so the
// mouth is rendered after this, and no beard ever has to cut a hole for it.
// The previous renderer's beard mask ran across the lips because it was drawn
// last, and no amount of shaping fixes that.
//
// Nothing is a solid colour mask. Fill is the base, and grouped strokes over
// it give the direction hair actually grows, which is what separates a beard
// from a painted chin.

import { Fragment } from 'react';
import { closedPath, clamp, lerp, pt, type Pt } from '../geom';
import { hairPalette } from '../palette';
import type { DrawContext } from '../types';
import { stream } from '../hair/outline';
import { facialHairStyle, type FacialHairStyle } from './styles';

interface Props {
  readonly ctx: DrawContext;
  readonly id: string;
  /** 0-1 from the identity's facial-hair density. */
  readonly density: number;
  readonly greying: number;
}

/** The lower face, from the cheek line down around the chin. */
function lowerFace(ctx: DrawContext, s: FacialHairStyle): Pt[] {
  const l = ctx.layout;
  const at = (t: number): number => lerp(l.crownY, l.chinY, t);
  const ts = [s.topT, 0.70, 0.80, 0.90, 0.97];
  const right = ts.map((t) => pt(l.cx + l.halfAt(at(t)) * (t > 0.95 ? 0.92 : 1.0), at(t)));
  const bottom = pt(l.cx, l.chinY + l.faceH * s.drop);
  const left = [...right].reverse().map((p) => pt(2 * l.cx - p.x, p.y));
  return [...right, bottom, ...left];
}

function regionPath(ctx: DrawContext, s: FacialHairStyle): string {
  const l = ctx.layout;
  const outer = lowerFace(ctx, s);
  if (s.cheek && s.jaw) {
    // A full lower face. The upper boundary runs just under the cheekbones.
    return closedPath(outer, 1.0);
  }
  if (s.jaw) {
    // A jawline band: the lower face, hollowed by an inner curve.
    const inner = outer.map((p) => pt(l.cx + (p.x - l.cx) * 0.74, p.y - l.faceH * 0.03));
    return `${closedPath(outer, 1.0)} ${closedPath([...inner].reverse(), 1.0)}`;
  }
  if (s.cheek) {
    // Sideburns only: two narrow strips down from the ear.
    return [-1, 1].map((dir) => closedPath([
      pt(l.cx + dir * l.halfAt(lerp(l.crownY, l.chinY, s.topT)) * 1.0, lerp(l.crownY, l.chinY, s.topT)),
      pt(l.cx + dir * l.halfAt(lerp(l.crownY, l.chinY, 0.66)) * 0.99, lerp(l.crownY, l.chinY, 0.66)),
      pt(l.cx + dir * l.halfAt(lerp(l.crownY, l.chinY, 0.66)) * 0.74, lerp(l.crownY, l.chinY, 0.66)),
      pt(l.cx + dir * l.halfAt(lerp(l.crownY, l.chinY, s.topT)) * 0.76, lerp(l.crownY, l.chinY, s.topT)),
    ], 0.9)).join(' ');
  }
  return '';
}

function chinPath(ctx: DrawContext, s: FacialHairStyle): string {
  const l = ctx.layout;
  const w = l.halfAt(l.chinY - l.faceH * 0.06) * (s.id === 'soul-patch' ? 0.28 : 0.76);
  const top = l.mouthY + l.faceH * (s.id === 'soul-patch' ? 0.026 : 0.040);
  const bottom = l.chinY + l.faceH * s.drop;
  return closedPath([
    pt(l.cx - w, top + l.faceH * 0.02),
    pt(l.cx - w * 0.9, bottom - l.faceH * 0.02),
    pt(l.cx, bottom),
    pt(l.cx + w * 0.9, bottom - l.faceH * 0.02),
    pt(l.cx + w, top + l.faceH * 0.02),
    pt(l.cx, top),
  ], 1.02);
}

function moustachePath(ctx: DrawContext, s: FacialHairStyle): string {
  const l = ctx.layout;
  const w = l.mouthWidth * (s.id === 'mustache-thick' || s.id === 'horseshoe' ? 0.74 : 0.62);
  const top = l.noseBaseY + l.faceH * 0.012;
  const bottom = l.mouthY - l.faceH * 0.012;
  const wing = s.id === 'horseshoe' ? l.faceH * 0.10 : 0;
  return closedPath([
    pt(l.cx - w, top + l.faceH * 0.014),
    pt(l.cx - w * 0.5, top),
    pt(l.cx, top + l.faceH * 0.008),
    pt(l.cx + w * 0.5, top),
    pt(l.cx + w, top + l.faceH * 0.014),
    pt(l.cx + w * 0.94, bottom + wing),
    pt(l.cx + w * 0.42, bottom),
    pt(l.cx, bottom - l.faceH * 0.004),
    pt(l.cx - w * 0.42, bottom),
    pt(l.cx - w * 0.94, bottom + wing),
  ], 0.95);
}

/** Short strokes in the direction the hair grows: down on the chin, out and
 *  down on the cheeks. This is what a beard is made of at portrait size. */
/**
 * Is this point somewhere this style actually grows?
 *
 * The first version scattered bristles over the whole lower face for every
 * style, so a moustache came with a full beard's worth of stubble and every
 * player in the grid ended up wearing the same grey fuzz. A style is a set of
 * regions; the bristles have to respect the set.
 */
function inRegion(ctx: DrawContext, s: FacialHairStyle, x: number, y: number): boolean {
  const l = ctx.layout;
  const half = l.halfAt(clamp(y, l.crownY + 1, l.chinY - 1));
  const off = Math.abs(x - l.cx);
  const at = (t: number): number => lerp(l.crownY, l.chinY, t);
  if (s.moustache && y > l.noseBaseY && y < l.mouthY && off < l.mouthWidth * 0.72) return true;
  if (s.chin && y > l.mouthY + l.faceH * 0.018 && off < half * 0.62) return true;
  if (s.jaw && y > at(0.74) && off > half * 0.30) return true;
  if (s.cheek && y > at(s.topT) && y < at(0.76) && off > half * 0.58) return true;
  if (s.neck && y > l.chinY - l.faceH * 0.04) return true;
  return false;
}

function Bristles({ ctx, s, count, colour }: {
  readonly ctx: DrawContext; readonly s: FacialHairStyle;
  readonly count: number; readonly colour: string;
}) {
  const l = ctx.layout;
  const rnd = stream(`${ctx.seed}:${s.id}:bristle`);
  const items = [];
  const top = lerp(l.crownY, l.chinY, s.topT);
  const bottom = l.chinY + l.faceH * s.drop;
  for (let i = 0; i < count; i += 1) {
    const y = lerp(top, bottom, rnd());
    const half = l.halfAt(clamp(y, l.crownY + 1, l.chinY - 1));
    const x = l.cx + (rnd() * 2 - 1) * half * 0.98;
    if (!inRegion(ctx, s, x, y)) continue;
    // Thinning in from the top edge, for the same reason the fill is
    // gradient-masked: growth has a boundary, not a border.
    const ramp = clamp((y - top) / Math.max(1e-6, l.faceH * 0.12), 0, 1);
    if (rnd() > 0.25 + ramp * 0.75) continue;
    const len = l.faceH * (0.012 + rnd() * 0.016);
    const lean = ((x - l.cx) / Math.max(1, half)) * len * 0.5;
    items.push(
      <path
        key={i}
        d={`M${String(x)},${String(y)} l${String(lean)},${String(len)}`}
        stroke={colour} strokeWidth={Math.max(0.6, l.faceH * 0.0045)}
        strokeLinecap="round" fill="none"
      />,
    );
  }
  return <Fragment>{items}</Fragment>;
}

export function FacialHair({ ctx, id, density, greying }: Props) {
  const s = facialHairStyle(id);
  if (s.id === 'clean') return null;

  const l = ctx.layout;
  const base = ctx.hair.base;
  const p = hairPalette(greying > 0 ? base : base);
  const clip = `${ctx.uid}-face`;
  const grad = `${ctx.uid}-beard`;
  const top = lerp(l.crownY, l.chinY, s.topT);
  const opacity = 0.35 + density * 0.55;
  const region = regionPath(ctx, s);
  // Scattered over the whole lower face and filtered down to the style's own
  // regions, so a moustache asks for as many samples as a full beard and keeps
  // a fraction of them.
  const dense = Math.round((ctx.detail > 0.5 ? 620 : 190) * (0.5 + density * 0.7));

  return (
    <g clipPath={`url(#${clip})`}>
      <defs>
        {/* Beards do not start on a ruled line. Filled and stippled from a flat
            boundary across the cheeks, every player came out wearing a
            horizontal edge under his eyes. */}
        <linearGradient
          id={grad} gradientUnits="userSpaceOnUse"
          x1={0} y1={top - l.faceH * 0.02} x2={0} y2={top + l.faceH * 0.13}
        >
          <stop offset="0%" stopColor={p.base} stopOpacity="0" />
          <stop offset="100%" stopColor={p.base} stopOpacity="1" />
        </linearGradient>
      </defs>
      <g opacity={opacity}>
        {s.fill > 0 && region !== '' && (
          <path d={region} fill={`url(#${grad})`} fillRule="evenodd" opacity={s.fill} />
        )}
        {s.fill > 0 && s.chin && (
          <path d={chinPath(ctx, s)} fill={`url(#${grad})`} opacity={s.fill * 0.9} />
        )}
        {s.fill > 0 && s.moustache && (
          <path d={moustachePath(ctx, s)} fill={p.base} opacity={s.fill * 0.9} />
        )}
        {/* stubble is texture only; a full beard gets texture over its fill */}
        <Bristles ctx={ctx} s={s} count={dense} colour={p.base} />
        {ctx.detail > 0.45 && (
          <Bristles ctx={ctx} s={s} count={Math.round(dense * 0.12)} colour={p.light} />
        )}
      </g>
      {s.fill > 0.8 && (
        <path
          d={s.chin ? chinPath(ctx, s) : region} fill="none" stroke={p.shadow}
          strokeWidth={Math.max(0.8, ctx.layout.faceH * 0.006)} opacity={0.3}
        />
      )}
    </g>
  );
}
