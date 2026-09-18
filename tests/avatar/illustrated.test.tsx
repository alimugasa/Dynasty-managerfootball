// The illustrated renderer's contracts.
//
// Two kinds of claim are worth pinning here. The first is coverage: the
// identity system stores sixty-two hairstyle ids, twenty-seven beards and ten
// eye colours, and a renderer that silently has no drawing for one of them
// produces a player with no hair rather than an error. The second is
// determinism, which is the whole promise of the avatar system -- the same
// seed has to produce the same portrait on every load and every device.

import { describe as suite, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HAIRSTYLES, FACIAL_HAIR } from '../../supabase/functions/_shared/avatar/hair';
import { EYE_COLORS } from '../../supabase/functions/_shared/avatar/traits';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import { faceMorph } from '../../supabase/functions/_shared/avatar/morph';
import { HAIR_STYLES, hairStyle } from '../../src/avatar/illustrated/hair/styles';
import { FACIAL_HAIR_STYLES, facialHairStyle } from '../../src/avatar/illustrated/facialHair/styles';
import { HEAD_SHAPES } from '../../src/avatar/illustrated/heads/shapes';
import { EYE_SPECS } from '../../src/avatar/illustrated/eyes/constructions';
import { BROW_SPECS } from '../../src/avatar/illustrated/brows/constructions';
import { NOSE_SPECS } from '../../src/avatar/illustrated/noses/constructions';
import { MOUTH_SPECS } from '../../src/avatar/illustrated/mouths/constructions';
import { EAR_SPECS } from '../../src/avatar/illustrated/ears/constructions';
import { eyeColour } from '../../src/avatar/illustrated/eyes/colors';
import { headFor, selectFeatures } from '../../src/avatar/illustrated/select';
import { hairOutline } from '../../src/avatar/illustrated/hair/outline';
import { buildFace } from '../../src/avatar/illustrated/layout';
import { headShape } from '../../src/avatar/illustrated/heads/shapes';
import { IllustratedPortrait } from '../../src/avatar/illustrated/Portrait';

const seedAt = (i: number): string => {
  let h = 0x811c9dc5;
  for (const ch of `ill#${String(i)}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0').repeat(2);
};

const POSITIONS = ['QB', 'OT', 'CB', 'DT', 'WR', 'LB'] as const;
const at = (i: number) => generateAvatar({
  seed: seedAt(i), position: POSITIONS[i % POSITIONS.length] as string, age: 21 + (i * 3) % 18,
});

/* ------------------------------------------------------------ coverage -- */

suite('the library covers what identity can store', () => {
  it('draws every hairstyle the trait library can assign', () => {
    const missing = HAIRSTYLES.filter((h) => hairStyle(h.id).id !== h.id);
    expect(missing.map((h) => h.id)).toEqual([]);
  });

  it('draws every facial-hair style the trait library can assign', () => {
    const missing = FACIAL_HAIR.filter((f) => facialHairStyle(f.id).id !== f.id);
    expect(missing.map((f) => f.id)).toEqual([]);
  });

  it('has a real colour for every eye-colour id', () => {
    // The ids are words, and CSS has opinions about some of them: `brown` is a
    // red and `dark-brown` is not a colour at all. Every id resolves through
    // the table rather than through the browser.
    for (const c of EYE_COLORS) {
      expect(eyeColour(c.id).iris).toMatch(/^#[0-9a-f]{6}$/);
      expect(eyeColour(c.id).limbal).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('meets the counts the brief asks for', () => {
    expect(HEAD_SHAPES.length).toBeGreaterThanOrEqual(20);
    expect(EYE_SPECS.length).toBeGreaterThanOrEqual(14);
    expect(NOSE_SPECS.length).toBeGreaterThanOrEqual(18);
    expect(MOUTH_SPECS.length).toBeGreaterThanOrEqual(14);
    expect(BROW_SPECS.length).toBeGreaterThanOrEqual(12);
    expect(EAR_SPECS.length).toBeGreaterThanOrEqual(5);
    expect(HAIR_STYLES.length).toBeGreaterThanOrEqual(35);
    expect(FACIAL_HAIR_STYLES.length).toBeGreaterThanOrEqual(15);
  });

  it('has no duplicate ids in any family', () => {
    const families = [HEAD_SHAPES, EYE_SPECS, BROW_SPECS, NOSE_SPECS, MOUTH_SPECS, EAR_SPECS, HAIR_STYLES];
    for (const family of families) {
      const ids = family.map((v: { id: string }) => v.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

suite('the hair outline', () => {
  it('is one subpath, so no fill rule decides what it covers', () => {
    // Two earlier shapes failed here in ways the fill hid. A crescent made of
    // two loops needs even-odd, and the clip that used it disagreed -- the
    // texture pass drew rows of hair across players' eyes and the fade
    // gradient washed grey over their foreheads. One subpath cannot.
    for (const style of HAIR_STYLES) {
      const m = faceMorph(at(3));
      const out = hairOutline(buildFace(headFor(m), m), style, 0.2);
      expect(out.mass.match(/M/g)?.length ?? 0).toBe(1);
      expect(out.mass.endsWith('Z')).toBe(true);
    }
  });

  it('keeps the mass off the face: nothing reaches the mouth', () => {
    const m = faceMorph(at(5));
    const l = buildFace(headFor(m), m);
    for (const style of HAIR_STYLES) {
      if (style.fall > 0.08) continue;
      const out = hairOutline(l, style, 0);
      expect(out.endY).toBeLessThan(l.mouthY);
    }
  });
});

/* ------------------------------------------------------------ selection -- */

suite('selection', () => {
  it('reaches every head silhouette across a population', () => {
    // Nearest-neighbour reached nine of twenty-two here, because morph values
    // cluster near the mean. The lattice is what fixed it, and this is the
    // test that would catch it regressing.
    const seen = new Set<string>();
    for (let i = 0; i < 800; i += 1) seen.add(headFor(faceMorph(at(i))).id);
    expect(seen.size).toBe(HEAD_SHAPES.length);
  });

  it('is deterministic for the same player', () => {
    for (let i = 0; i < 30; i += 1) {
      const a = selectFeatures(at(i), faceMorph(at(i)));
      const b = selectFeatures(at(i), faceMorph(at(i)));
      expect(b).toEqual(a);
    }
  });

  it('spreads the other families rather than settling on one drawing', () => {
    const noses = new Set<string>();
    const mouths = new Set<string>();
    const eyes = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const sel = selectFeatures(at(i), faceMorph(at(i)));
      noses.add(sel.nose);
      mouths.add(sel.mouth);
      eyes.add(sel.eyes);
    }
    expect(noses.size).toBeGreaterThanOrEqual(10);
    expect(mouths.size).toBeGreaterThanOrEqual(8);
    expect(eyes.size).toBeGreaterThanOrEqual(8);
  });
});

/* --------------------------------------------------------------- layout -- */

suite('the face layout', () => {
  it('pins the eye line, so the crop is the same for every skull', () => {
    const ys = new Set<number>();
    for (let i = 0; i < 40; i += 1) {
      const m = faceMorph(at(i));
      ys.add(Math.round(buildFace(headFor(m), m).eyeY));
    }
    // Only the small eyeLine morph moves it, and only by a few units.
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(14);
  });

  it('keeps the landmarks in order on every shape', () => {
    for (const shape of HEAD_SHAPES) {
      for (let i = 0; i < 12; i += 1) {
        const l = buildFace(shape, faceMorph(at(i)));
        expect(l.crownY).toBeLessThan(l.browY);
        expect(l.browY).toBeLessThan(l.eyeY);
        expect(l.eyeY).toBeLessThan(l.noseBaseY);
        expect(l.noseBaseY).toBeLessThan(l.mouthY);
        expect(l.mouthY).toBeLessThan(l.chinY);
        expect(l.halfAt(l.eyeY)).toBeGreaterThan(l.halfAt(l.chinY - 1));
      }
    }
  });

  it('gives a lineman a wider neck and shoulders than a receiver', () => {
    const line = faceMorph(generateAvatar({ seed: seedAt(5), position: 'OG', age: 27 }));
    const wide = faceMorph(generateAvatar({ seed: seedAt(5), position: 'WR', age: 27 }));
    expect(line.neckWidth).toBeGreaterThan(wide.neckWidth);
    expect(line.shoulderWidth).toBeGreaterThan(wide.shoulderWidth);
  });
});

/* --------------------------------------------------------------- render -- */

suite('rendering', () => {
  it('produces an SVG with no runtime error, at every size', () => {
    for (const px of [28, 64, 160, 240]) {
      const { container, unmount } = render(
        <IllustratedPortrait profile={at(2)} px={px} label="test" />,
      );
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('width')).toBe(String(px));
      unmount();
    }
  });

  it('draws the same artwork twice for the same player, apart from local SVG ids', () => {
    const artwork = (container: HTMLElement) => {
      const prefix = container.querySelector('[id]')?.id.split('-')[0];
      expect(prefix).toBeDefined();
      return container.innerHTML.replaceAll(prefix!, 'portrait');
    };
    const one = render(<IllustratedPortrait profile={at(7)} px={160} />);
    const first = artwork(one.container);
    one.unmount();
    const two = render(<IllustratedPortrait profile={at(7)} px={160} />);
    expect(artwork(two.container)).toBe(first);
    two.unmount();
  });

  it('gives two portraits on one page different gradient ids', () => {
    // SVG ids are document-global. Two portraits sharing one means the second
    // player wears the first player's skin, and it only shows up on a roster.
    const { container } = render(
      <>
        <IllustratedPortrait profile={at(1)} px={160} />
        <IllustratedPortrait profile={at(2)} px={160} />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('isolates clips and paint servers for repeated players and feature-library variants', () => {
    const profile = at(3);
    const { container, unmount } = render(<>
      <IllustratedPortrait profile={profile} px={112} bare override={{ head: 'oval-long' }} />
      <IllustratedPortrait profile={profile} px={112} bare override={{ head: 'square-heavy' }} />
      <IllustratedPortrait profile={profile} px={112} bare override={{ head: 'square-heavy' }} />
    </>);
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of container.querySelectorAll('svg')) {
      const localIds = new Set([...svg.querySelectorAll('[id]')].map((el) => el.id));
      for (const el of svg.querySelectorAll('*')) {
        for (const attr of el.attributes) {
          const reference = /^url\(#(.+)\)$/.exec(attr.value);
          if (reference) expect(localIds.has(reference[1]!)).toBe(true);
        }
      }
    }
    unmount();
  });

  it('holds the diagnostic palette fixed without changing geometry or identity', () => {
    const profile = at(4);
    const original = JSON.stringify(profile);
    const { container, rerender, unmount } = render(<IllustratedPortrait profile={profile} px={168} bare />);
    const paths = [...container.querySelectorAll('path')].map((el) => el.getAttribute('d'));
    rerender(<IllustratedPortrait profile={profile} px={168} bare
      diagnosticSkinTone={{ skinStep: 18, undertone: 'neutral' }} />);
    expect([...container.querySelectorAll('path')].map((el) => el.getAttribute('d'))).toEqual(paths);
    expect(JSON.stringify(profile)).toBe(original);
    const firstFill = container.querySelector('svg > g > path')?.getAttribute('fill');
    rerender(<IllustratedPortrait profile={at(19)} px={168} bare
      diagnosticSkinTone={{ skinStep: 18, undertone: 'neutral' }} />);
    expect(container.querySelector('svg > g > path')?.getAttribute('fill')).toBe(firstFill);
    expect(firstFill).toMatch(/^#[a-f0-9]{6}$/);
    unmount();
  });

  it('strips hair, beard and accessories in bare mode', () => {
    const full = render(<IllustratedPortrait profile={at(4)} px={240} />);
    const fullLen = full.container.innerHTML.length;
    full.unmount();
    const bare = render(<IllustratedPortrait profile={at(4)} px={240} bare />);
    expect(bare.container.innerHTML.length).toBeLessThan(fullLen);
    bare.unmount();
  });

  it('draws every head shape without throwing', () => {
    for (const shape of HEAD_SHAPES) {
      const { container, unmount } = render(
        <IllustratedPortrait profile={at(3)} px={160} bare override={{ head: shape.id }} />,
      );
      expect(container.querySelector('path')).not.toBeNull();
      expect(headShape(shape.id).id).toBe(shape.id);
      unmount();
    }
  });
});
