import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import { faceMorph } from '../../supabase/functions/_shared/avatar/morph';
import { buildFace } from '../../src/avatar/illustrated/layout';
import { HEAD_SHAPES } from '../../src/avatar/illustrated/heads/shapes';
import { headPath } from '../../src/avatar/illustrated/heads/Head';
import { headFor } from '../../src/avatar/illustrated/select';
import { Ears } from '../../src/avatar/illustrated/ears/Ears';
import { EAR_SPECS } from '../../src/avatar/illustrated/ears/constructions';
import { Eyes } from '../../src/avatar/illustrated/eyes/Eyes';
import { EYE_SPECS } from '../../src/avatar/illustrated/eyes/constructions';
import { skinPalette, hairPalette } from '../../src/avatar/illustrated/palette';
import type { DrawContext } from '../../src/avatar/illustrated/types';

const profile = (i: number) => generateAvatar({
  seed: i.toString(16).padStart(16, '0'), position: 'WR', age: 21 + i % 19,
});

function context(): DrawContext {
  const morph = faceMorph(profile(7));
  return { uid: 'anatomy', seed: 'anatomy', layout: buildFace(headFor(morph), morph), morph,
    age: 28, wear: 0, skin: skinPalette('#ac8769', 0.5),
    hair: hairPalette('#211611'), brow: hairPalette('#211611'), eyeColor: 'brown', detail: 1 };
}

// Sample the emitted cubic curves, including their handles, so a missing
// landmark or an asymmetric closure is caught in the drawn outline itself.
function contour(path: string) {
  const numbers = (text: string) => (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const start = numbers(path.slice(1, path.indexOf('C')));
  let [x, y] = start as [number, number];
  const points: { x: number; y: number }[] = [];
  for (const segment of path.matchAll(/C([^CZ]+)/g)) {
    const [ax, ay, bx, by, ex, ey] = numbers(segment[1]!) as [number, number, number, number, number, number];
    for (let j = 0; j < 10; j += 1) {
      const t = j / 10;
      const u = 1 - t;
      points.push({ x: u ** 3 * x + 3 * u ** 2 * t * ax + 3 * u * t ** 2 * bx + t ** 3 * ex,
        y: u ** 3 * y + 3 * u ** 2 * t * ay + 3 * u * t ** 2 * by + t ** 3 * ey });
    }
    [x, y] = [ex, ey];
  }
  return points;
}

describe('illustrated facial anatomy', () => {
  it('draws balanced crown and chin contours when jaw asymmetry is neutral', () => {
    const morph = { ...faceMorph(profile(15)), asymJaw: 0 };
    for (const shape of HEAD_SHAPES) {
      const layout = buildFace(shape, morph);
      const points = contour(headPath(layout));
      for (const point of points) {
        const reflection = Math.min(...points.map((p) =>
          Math.hypot(p.x - (2 * layout.cx - point.x), p.y - point.y)));
        expect(reflection, shape.id).toBeLessThan(0.03);
      }
    }
  });

  it('retains intentional jaw asymmetry instead of mirroring the whole face', () => {
    const m = { ...faceMorph(profile(15)), asymJaw: 1 };
    const l = buildFace(headFor(m), m);
    const points = contour(headPath(l));
    const leftWidth = l.cx - Math.min(...points.map((p) => p.x));
    const rightWidth = Math.max(...points.map((p) => p.x)) - l.cx;
    expect(rightWidth).toBeGreaterThan(leftWidth);
    expect(rightWidth / leftWidth).toBeLessThan(1.05);
  });

  it('keeps adult landmark proportions and eye openings inside the skull across a population', () => {
    for (let i = 1; i <= 300; i += 1) {
      const m = faceMorph(profile(i));
      const l = buildFace(headFor(m), m);
      const eyeFraction = (l.eyeY - l.crownY) / l.faceH;
      expect(eyeFraction).toBeGreaterThan(0.46);
      expect(eyeFraction).toBeLessThan(0.58);
      expect(l.browY).toBeLessThan(l.eyeY);
      expect(l.eyeY).toBeLessThan(l.noseBaseY);
      expect(l.noseBaseY).toBeLessThan(l.mouthY);
      expect((l.chinY - l.mouthY) / l.faceH).toBeLessThan(0.24);
      expect((l.eyeSpan + l.eyeSize) / 2).toBeLessThan(l.halfAt(l.eyeY) * 0.8);
      expect(l.eyeSpan - l.eyeSize).toBeGreaterThan(l.eyeSize * 0.65);
    }
  });

  it('attaches every ear construction to the skull instead of floating outside it', () => {
    const ctx = context();
    const { layout } = ctx;
    for (const ear of EAR_SPECS) {
      const { container, unmount } = render(<svg><Ears ctx={ctx} id={ear.id} /></svg>);
      const roots = [...container.querySelectorAll('svg > g')];
      expect(roots).toHaveLength(2);
      for (const [index, root] of roots.entries()) {
        const x = Number(/translate\(([^,]+)/.exec(root.getAttribute('transform')!)![1]);
        const sideWidth = layout.halfAt(layout.earY) * (index === 0 ? layout.asym.left / layout.asym.right : 1);
        expect(Math.abs(x - layout.cx), ear.id).toBeLessThan(sideWidth);
      }
      unmount();
    }
  });

  it('keeps iris size anatomical even in the widest eye constructions', () => {
    const ctx = context();
    for (const spec of EYE_SPECS) {
      const { container, unmount } = render(<svg><Eyes ctx={ctx} id={spec.id} /></svg>);
      const iris = container.querySelector('g[clip-path] > circle');
      const diameter = 2 * Number(iris?.getAttribute('r'));
      expect(diameter / ctx.layout.eyeSize, spec.id).toBeGreaterThan(0.4);
      expect(diameter / ctx.layout.eyeSize, spec.id).toBeLessThan(0.50);
      const aperture = contour(container.querySelector('clipPath > path')!.getAttribute('d')!);
      const height = Math.max(...aperture.map((p) => p.y)) - Math.min(...aperture.map((p) => p.y));
      expect(height / ctx.layout.eyeSize, spec.id).toBeLessThan(0.45);
      unmount();
    }
  });

  it('clips the iris and sclera to the same contour as the drawn lower lid', () => {
    for (const spec of EYE_SPECS) {
      const { container, unmount } = render(<svg><Eyes ctx={context()} id={spec.id} /></svg>);
      const opening = contour(container.querySelector('clipPath > path')!.getAttribute('d')!);
      const lower = container.querySelectorAll('svg > g > g > path[stroke]')[1]!;
      for (const point of contour(lower.getAttribute('d')!)) {
        expect(Math.min(...opening.map((p) => Math.hypot(p.x - point.x, p.y - point.y))), spec.id)
          .toBeLessThan(0.03);
      }
      unmount();
    }
  });
});
