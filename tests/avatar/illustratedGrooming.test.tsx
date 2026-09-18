import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import { faceMorph } from '../../supabase/functions/_shared/avatar/morph';
import { IllustratedPortrait } from '../../src/avatar/illustrated/Portrait';
import { buildFace, VIEW_H } from '../../src/avatar/illustrated/layout';
import { headFor } from '../../src/avatar/illustrated/select';
import { HEAD_SHAPES } from '../../src/avatar/illustrated/heads/shapes';
import { HAIR_STYLES } from '../../src/avatar/illustrated/hair/styles';
import { hairOutline } from '../../src/avatar/illustrated/hair/outline';
import { FACIAL_HAIR_STYLES } from '../../src/avatar/illustrated/facialHair/styles';
import { FacialHair } from '../../src/avatar/illustrated/facialHair/FacialHair';
import { Jersey } from '../../src/avatar/illustrated/body/Body';
import { hairPalette, skinPalette } from '../../src/avatar/illustrated/palette';
import type { DrawContext } from '../../src/avatar/illustrated/types';

const player = (i: number) => generateAvatar({
  seed: i.toString(16).padStart(16, '0'), age: 21 + i % 20, position: 'WR',
});
function context(): DrawContext {
  const morph = faceMorph(player(13));
  return { uid: 'grooming', seed: 'grooming', morph, layout: buildFace(headFor(morph), morph),
    age: 28, wear: 0, skin: skinPalette('#a37b60', 0.5), hair: hairPalette('#231710'),
    brow: hairPalette('#231710'), eyeColor: 'brown', detail: 1 };
}

function verifyReferences(container: HTMLElement) {
  const svg = container.querySelector('svg')!;
  const ids = [...svg.querySelectorAll('[id]')].map((el) => el.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const el of svg.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      expect(attr.value).not.toMatch(/NaN|Infinity|undefined/);
      const ref = /^url\(#(.+)\)$/.exec(attr.value);
      if (ref) expect(ids).toContain(ref[1]);
    }
  }
}

describe('reference-guided illustrated grooming', () => {
  it('draws every existing hair and beard style with finite geometry and local paint references', () => {
    const original = player(9);
    const stored = JSON.stringify(original);
    for (const [index, style] of HAIR_STYLES.entries()) {
      const profile = { ...original, appearance: { ...original.appearance, hairstyle: style.id,
        recession: index % 2, facialHair: FACIAL_HAIR_STYLES[index % FACIAL_HAIR_STYLES.length]!.id } };
      const { container, unmount } = render(<IllustratedPortrait profile={profile} px={168} />);
      verifyReferences(container);
      unmount();
    }
    expect(JSON.stringify(original)).toBe(stored);
  });

  it('keeps the scalp cap above the eyes while hanging locks can fall behind the ears', () => {
    const original = player(5);
    const morph = faceMorph(original);
    const layout = buildFace(headFor(morph), morph);
    for (const style of HAIR_STYLES.filter((s) => ['locs', 'braids', 'twists'].includes(s.family))) {
      const profile = { ...original, appearance: { ...original.appearance, hairstyle: style.id } };
      const { container, unmount } = render(<IllustratedPortrait profile={profile} px={168} />);
      const cap = container.querySelector('clipPath[id$="-haircap"] > rect')!;
      expect(Number(cap.getAttribute('height')), style.id).toBeLessThan(layout.browY);
      expect(container.querySelectorAll('path[stroke-linecap="round"]').length).toBeGreaterThan(20);
      verifyReferences(container);
      unmount();
    }
  });

  it('keeps every short haircut hairline clear of the brows at both recession limits', () => {
    for (const shape of HEAD_SHAPES) {
      const l = buildFace(shape, faceMorph(player(4)));
      for (const style of HAIR_STYLES) {
        for (const recession of [0, 1]) {
          expect(hairOutline(l, style, recession).hairlineY, `${shape.id}/${style.id}`)
            .toBeLessThan(l.browY);
        }
      }
    }
  });

  it('renders stubble as clipped grain without a flat beard mask', () => {
    for (const id of ['stubble-light', 'stubble-heavy', 'stubble-neck']) {
      const { container, unmount } = render(<svg><FacialHair ctx={context()}
        id={id} density={0.8} greying={0} /></svg>);
      expect(container.querySelector('g > path[fill^="url("]')).toBeNull();
      expect(container.querySelector('g[clip-path="url(#grooming-face)"] path[stroke]')).not.toBeNull();
      unmount();
    }
  });

  it('clips dense beard grain to its growth shape, including the chin below the skull', () => {
    const { container } = render(<svg><FacialHair ctx={context()}
      id="beard-full" density={1} greying={0} /></svg>);
    const growth = container.querySelector('clipPath[id$="-beard-growth"]')!;
    expect(growth.querySelectorAll('path')).toHaveLength(2);
    const texture = container.querySelector('g[clip-path="url(#grooming-beard-growth)"]')!;
    expect(texture.querySelectorAll('path[stroke]').length).toBeGreaterThan(30);
    expect(texture.closest('g[clip-path="url(#grooming-face)"]')).toBeNull();
  });

  it('keeps the crew collar visible across the full head library and different builds', () => {
    for (const shape of HEAD_SHAPES) {
      for (const position of ['QB', 'WR', 'OG']) {
        const morph = faceMorph(generateAvatar({ seed: '0000000000000031', position, age: 30 }));
        const ctx = { ...context(), morph, layout: buildFace(shape, morph) };
        const { container, unmount } = render(<svg><Jersey ctx={ctx} shirt="#26303b" collar="#bec7cc" /></svg>);
        const collar = container.querySelector('path[stroke="#bec7cc"]')!;
        const numbers = (collar.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
        const ys = numbers.filter((_, i) => i % 2 === 1);
        expect(Math.max(...ys) + Number(collar.getAttribute('stroke-width')) / 2, shape.id).toBeLessThan(VIEW_H);
        expect(Math.min(...ys), shape.id).toBeGreaterThan(ctx.layout.chinY);
        unmount();
      }
    }
  });
});
