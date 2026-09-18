// The morph and the anatomy, which are pure and therefore testable without a
// canvas. The painting itself is checked by looking at it in the lab -- a
// golden image over a generated face would fail on every tuning pass and teach
// everybody to regenerate it without looking.

import { describe, expect, it } from 'vitest';
import { faceMorph, type FaceMorph } from '../../supabase/functions/_shared/avatar/morph';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import { bodyShape, headOutline, landmarks } from '../../src/avatar/raster/anatomy';

const seedAt = (i: number): string =>
  `${(i * 2654435761 >>> 0).toString(16).padStart(8, '0')}b7e151628aed2a6a`;

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K'];
const at = (i: number, age = 26): ReturnType<typeof generateAvatar> =>
  generateAvatar({ seed: seedAt(i), position: POSITIONS[i % POSITIONS.length] as string, age });

const KEYS = Object.keys(faceMorph(at(0))) as (keyof FaceMorph)[];

describe('the morph', () => {
  it('gives every dimension a finite value inside its band', () => {
    for (let i = 0; i < 400; i += 1) {
      const m = faceMorph(at(i, 21 + (i * 7) % 18));
      for (const k of KEYS) {
        expect(Number.isFinite(m[k]), `${k} on seed ${String(i)}`).toBe(true);
        expect(Math.abs(m[k]), `${k} on seed ${String(i)}`).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('draws the same face twice from one seed', () => {
    for (let i = 0; i < 40; i += 1) {
      expect(faceMorph(at(i))).toEqual(faceMorph(at(i)));
    }
  });

  it('keeps the bones still while the years pass', () => {
    // The dimensions age is allowed to move, and no others. If this list grows
    // without somebody meaning it to, a player stops being himself at 33.
    const ageable = new Set<keyof FaceMorph>([
      'cheekFullness', 'lidHeavy', 'lowerLid', 'eyeHeight', 'browRidge', 'browHeight',
      'noseLength', 'tipAngle', 'upperLip', 'lowerLip', 'philtrumLength', 'mouthCorner',
      'earLength',
    ]);
    for (let i = 0; i < 30; i += 1) {
      const young = faceMorph(at(i, 22));
      const old = faceMorph(at(i, 37));
      for (const k of KEYS) {
        if (ageable.has(k)) continue;
        expect(old[k], `${k} moved with age on seed ${String(i)}`).toBeCloseTo(young[k], 6);
      }
    }
    // And something must actually have changed, or the test proves nothing.
    expect(faceMorph(at(3, 37)).cheekFullness).toBeLessThan(faceMorph(at(3, 22)).cheekFullness);
  });

  it('spreads every dimension across its range rather than clustering', () => {
    // A dimension that never leaves the middle is a dimension that is not
    // doing any work, which is how fifty parameters still produce one face.
    const seen = new Map<keyof FaceMorph, { lo: number; hi: number }>();
    for (let i = 0; i < 600; i += 1) {
      const m = faceMorph(at(i, 21 + (i * 5) % 18));
      for (const k of KEYS) {
        const s = seen.get(k) ?? { lo: 1, hi: -1 };
        seen.set(k, { lo: Math.min(s.lo, m[k]), hi: Math.max(s.hi, m[k]) });
      }
    }
    for (const [k, s] of seen) {
      expect(s.hi - s.lo, `${k} spans only ${(s.hi - s.lo).toFixed(2)}`).toBeGreaterThan(0.55);
    }
  });
});

describe('the anatomy', () => {
  it('keeps the classical order of the landmarks', () => {
    for (let i = 0; i < 400; i += 1) {
      const f = landmarks(faceMorph(at(i, 21 + (i * 3) % 18)));
      expect(f.crownY).toBeLessThan(f.trichionY);
      expect(f.trichionY).toBeLessThan(f.browY);
      expect(f.browY).toBeLessThan(f.eyeY);
      expect(f.eyeY).toBeLessThan(f.tipY);
      expect(f.tipY).toBeLessThan(f.subnasaleY);
      expect(f.subnasaleY).toBeLessThan(f.stomionY);
      expect(f.stomionY).toBeLessThan(f.gnathionY);
      // The widest point of a head is the cheekbone, and the jaw is narrower
      // than it on everybody -- a jaw that overtook it would read as a mask.
      expect(f.halfGonion).toBeLessThan(f.halfZygion);
      expect(f.halfChin).toBeLessThan(f.halfGonion);
    }
  });

  it('draws a head that is wider than it is narrow and never inside out', () => {
    for (let i = 0; i < 300; i += 1) {
      const m = faceMorph(at(i));
      const f = landmarks(m);
      const pts = headOutline(f, m);
      const xs = pts.map(([x]) => x);
      const width = Math.max(...xs) - Math.min(...xs);
      // Bizygomatic width runs roughly three quarters of crown-to-chin.
      expect(width / f.gnathionY).toBeGreaterThan(0.64);
      expect(width / f.gnathionY).toBeLessThan(0.95);
      for (const [x, y] of pts) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
    }
  });

  it('builds the trenches a different shape from the secondary', () => {
    const neck = (position: string): number => {
      let total = 0;
      for (let i = 0; i < 60; i += 1) {
        const p = generateAvatar({ seed: seedAt(i * 3), position, age: 26 });
        const m = faceMorph(p);
        total += bodyShape(landmarks(m), m).neckHalf;
      }
      return total / 60;
    };
    expect(neck('OG')).toBeGreaterThan(neck('CB') * 1.18);
  });
});
