// The renderer, checked for the things that would reach a screen broken.
//
// Not a pixel comparison: a golden image over a generated face would fail on
// every tuning pass and teach everybody to regenerate it without looking,
// which is worse than no test. These assert the properties a portrait has to
// have -- it is SVG, it is finite, it draws the whole person, and it never
// returns nothing for a player the league could actually contain.

import type React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { svgPortraitRenderer } from '../../src/avatar/svgPortrait';
import { PORTRAIT_SIZES } from '../../src/avatar/portrait';
import { faceGeometry } from '../../src/avatar/geometry';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import { initials } from '../../src/avatar/PlayerAvatar';

const seedAt = (i: number): string =>
  `${(i * 2654435761 >>> 0).toString(16).padStart(8, '0')}b7e151628aed2a6a`;

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS'];

const draw = (i: number, position: string, age: number, size = 'profile' as const): string => {
  const profile = generateAvatar({ seed: seedAt(i), position, age });
  const node = svgPortraitRenderer.render({
    profile, size, primary: '#2C4A6E', secondary: '#C4703A', label: 'A Player',
  });
  expect(node).not.toBeNull();
  return renderToStaticMarkup(node as React.ReactElement);
};

describe('the portrait renderer', () => {
  it('draws every player a league can hold', () => {
    for (let i = 0; i < 300; i += 1) {
      const svg = draw(i, POSITIONS[i % POSITIONS.length] as string, 21 + (i * 7) % 18);
      expect(svg.startsWith('<svg')).toBe(true);
      // NaN in a path attribute renders as the literal string and silently
      // draws nothing, which is exactly the failure a screen cannot show.
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('Infinity');
      expect(svg).not.toContain('undefined');
    }
  });

  it('draws a whole person: a face, eyes, a mouth and a body', () => {
    const svg = draw(7, 'WR', 26);
    // Two eyes and two pupils, a clip for the face, and a collar.
    expect((svg.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(svg).toContain('clipPath');
    expect((svg.match(/<path/g) ?? []).length).toBeGreaterThan(6);
  });

  it('gives every size a portrait', () => {
    for (const size of PORTRAIT_SIZES) {
      const profile = generateAvatar({ seed: seedAt(3), position: 'QB', age: 27 });
      const node = svgPortraitRenderer.render({ profile, size, label: 'A Player' });
      expect(node).not.toBeNull();
      expect(renderToStaticMarkup(node as React.ReactElement)).toContain('viewBox="0 0 100 100"');
    }
  });

  it('keeps the drawing inside its box', () => {
    // A face wider than the viewBox is clipped by the browser without
    // complaint, which reads as a cropped portrait rather than as a bug.
    for (let i = 0; i < 200; i += 1) {
      const profile = generateAvatar({ seed: seedAt(i), position: POSITIONS[i % POSITIONS.length] as string, age: 30 });
      const g = faceGeometry(profile);
      expect(g.cx - g.cheekW).toBeGreaterThan(4);
      expect(g.cx + g.cheekW).toBeLessThan(96);
      expect(g.crownY).toBeGreaterThan(2);
      expect(g.chinY).toBeLessThan(88);
    }
  });

  it('draws the same markup for the same player twice', () => {
    expect(draw(11, 'LB', 29)).toBe(draw(11, 'LB', 29));
  });

  it('draws different markup for different players', () => {
    expect(draw(11, 'LB', 29)).not.toBe(draw(12, 'LB', 29));
  });
});

describe('the fallback', () => {
  it('takes initials from a name and never invents one', () => {
    expect(initials('Marcus Okonkwo')).toBe('MO');
    expect(initials('Dre')).toBe('D');
    expect(initials('  ')).toBe('');
    // First and last, not first and second: "De" is not this man's surname.
    expect(initials('Jean-Luc De Vries')).toBe('JV');
  });
});
