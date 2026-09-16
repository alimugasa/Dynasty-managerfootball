// The hybrid portrait pipeline, tested without a single pixel of artwork.
//
// That is the point of splitting selection from resolution: everything above
// `planPortrait` is a pure function of a seed, so the mapping can be proved
// deterministic and proved to cover the lattice before anybody paints
// anything. The parts that need images are tested through the parts that do
// not -- the layer order, the missing-asset report, the affine solve.

import { describe as suite, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseManifest, isEmptyLibrary, MANIFEST_VERSION } from '../../src/avatar/hybrid/manifest';
import {
  STRUCTURE_FAMILIES, WARP_COLS, WARP_LIMIT, selectLayers, structureFamily, warpGrid,
} from '../../src/avatar/hybrid/select';
import { planPortrait } from '../../src/avatar/hybrid/plan';
import { affineFor, type Tri } from '../../src/avatar/hybrid/composite';
import { describe } from '../../src/avatar/v2/descriptor';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';

const shipped: unknown = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/avatar-assets/manifest.json'), 'utf8'),
);

const seedAt = (i: number): string => {
  let h = 0x811c9dc5;
  for (const ch of `hybrid#${String(i)}`) {
    h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').repeat(2);
};

const POSITIONS = ['QB', 'OT', 'CB', 'DT', 'WR', 'LB'] as const;

const at = (i: number) => generateAvatar({
  seed: seedAt(i), position: POSITIONS[i % POSITIONS.length] as string, age: 21 + (i * 3) % 18,
});

/* ------------------------------------------------------------ manifest -- */

suite('the shipped manifest', () => {
  it('is valid and declares the frame, but has no artwork in it', () => {
    const parsed = parseManifest(shipped);
    expect(parsed.ok, parsed.ok ? '' : parsed.problems.join('\n')).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.canvas).toEqual({ width: 1024, height: 1024 });
    expect(parsed.manifest.anchors.eyeY).toBeCloseTo(0.395, 5);
    expect(parsed.manifest.pigmentAnchors).toHaveLength(3);
    // Empty is a state, not a fault. The renderer must be able to tell the
    // difference between "no art yet" and "broken delivery".
    expect(isEmptyLibrary(parsed.manifest)).toBe(true);
  });
});

suite('manifest validation', () => {
  const good = (): Record<string, unknown> => JSON.parse(JSON.stringify(shipped));

  it('reports a missing anchor rather than defaulting it', () => {
    const bad = good();
    delete (bad['anchors'] as Record<string, unknown>)['eyeY'];
    const parsed = parseManifest(bad);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems.some((p) => p.includes('eyeY'))).toBe(true);
  });

  it('reports every problem at once, not just the first', () => {
    const bad = good();
    delete (bad['anchors'] as Record<string, unknown>)['eyeY'];
    delete (bad['anchors'] as Record<string, unknown>)['chinY'];
    bad['version'] = 99;
    const parsed = parseManifest(bad);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects an absent layer array, and accepts an empty one', () => {
    const bad = good();
    delete bad['hair'];
    expect(parseManifest(bad).ok).toBe(false);
    const ok = good();
    ok['hair'] = [];
    expect(parseManifest(ok).ok).toBe(true);
  });

  it('rejects a base face naming a pigment anchor that was never declared', () => {
    const bad = good();
    bad['baseFaces'] = [{
      id: 's0-ultra-prime', structure: 's0', pigment: 'ultra', age: 'prime',
      albedo: 's0/albedo.png', shading: 's0/shading.png', mask: 's0/mask.png',
    }];
    const parsed = parseManifest(bad);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems.some((p) => p.includes('ultra'))).toBe(true);
  });

  it('rejects a path that points off the library', () => {
    const bad = good();
    bad['background'] = [{ id: 'studio', file: 'https://example.invalid/sweep.png' }];
    expect(parseManifest(bad).ok).toBe(false);
  });

  it('pins the version so an old client refuses a newer library', () => {
    expect(MANIFEST_VERSION).toBe(1);
  });
});

/* ----------------------------------------------------------- selection -- */

suite('selection', () => {
  it('is deterministic: the same player selects the same assets', () => {
    for (let i = 0; i < 40; i += 1) {
      const a = selectLayers(describe(at(i)));
      const b = selectLayers(describe(at(i)));
      expect(b).toEqual(a);
    }
  });

  it('covers every structure family, so no painted face goes unused', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 600; i += 1) seen.add(structureFamily(describe(at(i)).geometry));
    expect(seen.size).toBe(STRUCTURE_FAMILIES);
  });

  it('spreads across families rather than crowding one', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 1200; i += 1) {
      const f = structureFamily(describe(at(i)).geometry);
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    // A lattice that put half a league on one painted skull would defeat the
    // purpose of painting twelve. No family may exceed a third.
    for (const n of counts.values()) expect(n / 1200).toBeLessThan(0.34);
  });

  it('strips hair, beard and accessories for the bare test', () => {
    const sel = selectLayers(describe(at(3), { bare: true }));
    expect(sel.hairStyleId).toBeNull();
    expect(sel.facialHairId).toBeNull();
    expect(sel.accessoryId).toBeNull();
    expect(sel.complexionId).toBeNull();
  });

  it('bands age at 33, where the veteran plate takes over', () => {
    const young = generateAvatar({ seed: seedAt(7), position: 'CB', age: 32 });
    const old = generateAvatar({ seed: seedAt(7), position: 'CB', age: 33 });
    expect(selectLayers(describe(young)).ageBand).toBe('prime');
    expect(selectLayers(describe(old)).ageBand).toBe('veteran');
    // Same man, same painted skull: only the plate changes.
    expect(selectLayers(describe(old)).structure)
      .toBe(selectLayers(describe(young)).structure);
  });
});

suite('the micro-warp', () => {
  it('never moves a control point past the published bound', () => {
    for (let i = 0; i < 300; i += 1) {
      for (const [dx, dy] of warpGrid(describe(at(i)).geometry)) {
        expect(Math.abs(dx)).toBeLessThanOrEqual(WARP_LIMIT + 1e-9);
        expect(Math.abs(dy)).toBeLessThanOrEqual(WARP_LIMIT + 1e-9);
      }
    }
  });

  it('damps the rows either side of the eye line, so the anchors survive', () => {
    // Rows 2 and 3 straddle eyeY. If they moved as freely as the jaw, every
    // hair layer in the library would stop fitting.
    const worst = { anchored: 0, free: 0 };
    for (let i = 0; i < 200; i += 1) {
      const g = warpGrid(describe(at(i)).geometry);
      g.forEach(([dx, dy], k) => {
        const row = Math.floor(k / WARP_COLS);
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        if (row === 2 || row === 3) worst.anchored = Math.max(worst.anchored, m);
        else worst.free = Math.max(worst.free, m);
      });
    }
    expect(worst.anchored).toBeLessThan(worst.free);
  });

  it('actually moves something, or it is not breaking any ties', () => {
    const moved = warpGrid(describe(at(11)).geometry)
      .some(([dx, dy]) => Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4);
    expect(moved).toBe(true);
  });
});

/* ---------------------------------------------------------------- plan -- */

const FULL = {
  version: 1,
  canvas: { width: 1024, height: 1024 },
  anchors: {
    crownY: 0.155, eyeY: 0.395, chinY: 0.665, eyeCentreX: 0.5, eyeSpanX: 0.175, shoulderY: 0.92,
  },
  pigmentAnchors: [{ id: 'deep', step: 5 }, { id: 'mid', step: 18 }, { id: 'light', step: 30 }],
  baseFaces: Array.from({ length: STRUCTURE_FAMILIES }, (_, i) => i).flatMap((i) =>
    ['deep', 'mid', 'light'].flatMap((p) => ['prime', 'veteran'].map((a) => ({
      id: `s${String(i)}-${p}-${a}`, structure: `s${String(i)}`, pigment: p, age: a,
      albedo: `s${String(i)}-${p}-${a}/albedo.png`,
      shading: `s${String(i)}-${p}-${a}/shading.png`,
      mask: `s${String(i)}-${p}-${a}/mask.png`,
    }))),
  ),
  hair: [] as unknown[],
  facialHair: [] as unknown[],
  complexion: [] as unknown[],
  age: [{ id: 'lines', file: 'lines.png', strength: 0.6 }],
  accessories: [] as unknown[],
  clothing: [{
    id: 'all', builds: ['slight', 'lean', 'median', 'heavy', 'massive'],
    back: 'all/back.png', front: 'all/front.png',
  }],
  background: [{ id: 'studio', file: 'studio.png' }],
};

const fullManifest = () => {
  const parsed = parseManifest(JSON.parse(JSON.stringify(FULL)));
  if (!parsed.ok) throw new Error(parsed.problems.join('\n'));
  return parsed.manifest;
};

suite('planning', () => {
  it('against the empty library, reports what is missing and draws nothing', () => {
    const parsed = parseManifest(shipped);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = planPortrait(parsed.manifest, selectLayers(describe(at(1))), 'k');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const kinds = result.missing.map((m) => m.kind);
    expect(kinds).toContain('base-face');
    expect(kinds).toContain('background');
    expect(kinds).toContain('clothing');
  });

  it('names the exact base set an artist would have to paint', () => {
    const parsed = parseManifest(shipped);
    if (!parsed.ok) throw new Error('fixture');
    const sel = selectLayers(describe(at(4)));
    const result = planPortrait(parsed.manifest, sel, 'k');
    if (result.ok) throw new Error('expected a gap');
    const base = result.missing.find((m) => m.kind === 'base-face');
    expect(base?.need).toContain(sel.structure);
    expect(base?.need).toContain(sel.ageBand);
  });

  it('stacks the layers in the order the specification fixes', () => {
    const bare = selectLayers(describe(at(2), { bare: true }));
    const result = planPortrait(fullManifest(), bare, 'k');
    expect(result.ok, result.ok ? '' : result.missing.map((m) => m.need).join('; ')).toBe(true);
    if (!result.ok) return;
    const kinds = result.plan.layers.map((l) => l.kind);
    expect(kinds[0]).toBe('background');
    expect(kinds[1]).toBe('clothing-back');
    expect(kinds.indexOf('base-albedo')).toBeLessThan(kinds.indexOf('base-shading'));
    expect(kinds[kinds.length - 1]).toBe('clothing-front');
  });

  it('puts the hair mass behind the skull and the fall in front of it', () => {
    const manifest = parseManifest({
      ...JSON.parse(JSON.stringify(FULL)),
      hair: [{
        id: 'mid-coily', styles: ['afro-short'], family: 'coily',
        back: 'mid-coily/back.png', front: 'mid-coily/front.png',
      }],
    });
    if (!manifest.ok) throw new Error(manifest.problems.join('\n'));
    const sel = { ...selectLayers(describe(at(5))), hairStyleId: 'afro-short', complexionId: null, accessoryId: null, facialHairId: null };
    const result = planPortrait(manifest.manifest, sel, 'k');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const kinds = result.plan.layers.map((l) => l.kind);
    expect(kinds.indexOf('hair-back')).toBeLessThan(kinds.indexOf('base-albedo'));
    expect(kinds.indexOf('hair-front')).toBeGreaterThan(kinds.indexOf('base-albedo'));
  });

  it('records a substitution instead of pretending the coordinate was painted', () => {
    const thin = JSON.parse(JSON.stringify(FULL)) as typeof FULL;
    thin.baseFaces = thin.baseFaces.filter((b) => b.age === 'prime');
    const parsed = parseManifest(thin);
    if (!parsed.ok) throw new Error(parsed.problems.join('\n'));
    const veteran = generateAvatar({ seed: seedAt(9), position: 'OT', age: 36 });
    const sel = { ...selectLayers(describe(veteran, { bare: true })) };
    const result = planPortrait(parsed.manifest, sel, 'k');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.substitutions).toHaveLength(1);
    expect(result.plan.substitutions[0]?.why).toContain('veteran');
  });

  it('reports how far the tint has to carry the painted anchor', () => {
    const sel = selectLayers(describe(at(6), { bare: true }));
    const result = planPortrait(fullManifest(), sel, 'k');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Three anchors over 36 steps: the furthest any player can sit from the
    // nearest painted one is seven steps.
    expect(result.plan.pigmentDistance).toBeLessThanOrEqual(7);
  });
});

/* ----------------------------------------------------------- composite -- */

suite('the mesh warp solve', () => {
  it('carries a triangle onto itself as the identity', () => {
    const tri: Tri = [[0, 0], [10, 0], [0, 10]];
    const m = affineFor(tri, tri);
    expect(m).not.toBeNull();
    expect(m?.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('carries each source vertex onto its destination', () => {
    const src: Tri = [[0, 0], [8, 1], [2, 9]];
    const dst: Tri = [[3, 4], [11, 6], [4, 13]];
    const m = affineFor(src, dst);
    if (m === null) throw new Error('degenerate');
    src.forEach(([x, y], i) => {
      const target = dst[i] as readonly [number, number];
      expect(m[0] * x + m[2] * y + m[4]).toBeCloseTo(target[0], 6);
      expect(m[1] * x + m[3] * y + m[5]).toBeCloseTo(target[1], 6);
    });
  });

  it('refuses a degenerate triangle rather than producing a NaN transform', () => {
    expect(affineFor([[0, 0], [1, 1], [2, 2]], [[0, 0], [1, 0], [0, 1]])).toBeNull();
  });
});
