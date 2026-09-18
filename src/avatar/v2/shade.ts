// Lighting a surface instead of painting a face.
//
// The height field is sampled onto a grid, normals come from its gradient,
// cavity occlusion comes from comparing each point against a blurred copy of
// itself, and then every pixel gets the same three-light rig and the same skin
// response. Nothing in here knows what a nose is. That is the point: the shadow
// under a brow exists because the brow is raised and the light is above, not
// because somebody decided a brow should have a shadow under it.
//
// Skin is not a Lambert surface. Three things have to be there or it reads as
// painted plastic:
//
//   wrap        light bleeds past the terminator, because it enters the skin
//               and comes back out somewhere else
//   transmission that bleed is red, because what comes back out has been
//               through blood
//   sheen       a broad, weak specular. A tight highlight reads as wet vinyl;
//               no highlight at all reads as chalk.

import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import { earHeight, height, inside, layout, type Layout } from './field';

export interface Surface {
  readonly size: number;
  readonly z: Float32Array;
  readonly mask: Float32Array;
  readonly ao: Float32Array;
  readonly layout: Layout;
}

/** Sample the field onto a grid, then derive everything else from it. */
export function buildSurface(m: FaceMorph, size: number): Surface {
  const z = new Float32Array(size * size);
  const mask = new Float32Array(size * size);
  const l = layout(m);

  for (let j = 0; j < size; j += 1) {
    const y = (j + 0.5) / size;
    for (let k = 0; k < size; k += 1) {
      const x = (k + 0.5) / size;
      const idx = j * size + k;
      const head = inside(l, m, x, y);
      let hz = head > 0 ? height(l, m, x, y) : 0;
      let cover = head > 0 ? 1 : 0;
      // Ears are their own surfaces beside the head, not part of its outline.
      for (const s of [-1, 1] as const) {
        const e = earHeight(l, m, s, x, y);
        if (e > 0) { hz = Math.max(hz, e + 0.19); cover = 1; }
      }
      z[idx] = hz;
      mask[idx] = cover;
    }
  }

  return { size, z, mask, ao: cavity(z, mask, size), layout: l };
}

/**
 * Cavity occlusion: how much of the sky a point can see.
 *
 * Approximated as the difference between a point and a blurred copy of the
 * surface around it -- points that sit below their neighbourhood are in a
 * crease and lose light. It is not a ray-traced occlusion term and does not
 * need to be: eye sockets, nostrils, the crease under the lower lip and the
 * groove of the philtrum all fall out of it for nothing, and those are the
 * places a face looks wrong without.
 */
function cavity(z: Float32Array, mask: Float32Array, size: number): Float32Array {
  const blur = new Float32Array(size * size);
  const tmp = new Float32Array(size * size);
  const r = Math.max(2, Math.round(size / 26));
  // Separable box blur, twice, which is close enough to a gaussian here.
  for (let pass = 0; pass < 2; pass += 1) {
    const src = pass === 0 ? z : blur;
    for (let j = 0; j < size; j += 1) {
      for (let k = 0; k < size; k += 1) {
        let sum = 0; let n = 0;
        for (let d = -r; d <= r; d += 1) {
          const kk = k + d;
          if (kk < 0 || kk >= size) continue;
          sum += src[j * size + kk] as number; n += 1;
        }
        tmp[j * size + k] = sum / Math.max(1, n);
      }
    }
    for (let k = 0; k < size; k += 1) {
      for (let j = 0; j < size; j += 1) {
        let sum = 0; let n = 0;
        for (let d = -r; d <= r; d += 1) {
          const jj = j + d;
          if (jj < 0 || jj >= size) continue;
          sum += tmp[jj * size + k] as number; n += 1;
        }
        blur[j * size + k] = sum / Math.max(1, n);
      }
    }
  }
  const ao = new Float32Array(size * size);
  for (let i = 0; i < ao.length; i += 1) {
    if ((mask[i] as number) <= 0) { ao[i] = 1; continue; }
    const diff = (z[i] as number) - (blur[i] as number);
    // Below the neighbourhood darkens hard; above it brightens a little.
    // Floored well above zero. Creases should read as creases, not as holes:
    // an occlusion term that reaches black removes the feature it is meant to
    // describe.
    ao[i] = Math.max(0.42, Math.min(1.12, 1 + diff * 19));
  }
  return ao;
}

export interface Normal { readonly nx: number; readonly ny: number; readonly nz: number }

/** The surface normal, from the height gradient. `relief` trades physical
 *  accuracy for readability: a face lit at true scale is very flat, and every
 *  renderer of skin exaggerates. */
export function normalAt(s: Surface, k: number, j: number, relief: number): Normal {
  const size = s.size;
  const at = (kk: number, jj: number): number =>
    s.z[Math.min(size - 1, Math.max(0, jj)) * size + Math.min(size - 1, Math.max(0, kk))] as number;
  const dzdx = (at(k + 1, j) - at(k - 1, j)) * 0.5;
  const dzdy = (at(k, j + 1) - at(k, j - 1)) * 0.5;
  const nx = -dzdx * relief;
  const ny = -dzdy * relief;
  const len = Math.sqrt(nx * nx + ny * ny + 1);
  return { nx: nx / len, ny: ny / len, nz: 1 / len };
}

/** The rig. One key, one fill, one rim, identical for every player -- which is
 *  what makes a set of these read as a portrait series. */
const KEY = { x: -0.42, y: -0.60, z: 0.68 };
const FILL = { x: 0.62, y: -0.12, z: 0.78 };
const RIM = { x: 0.70, y: -0.42, z: -0.58 };
const norm = (v: { x: number; y: number; z: number }): typeof v => {
  const d = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return { x: v.x / d, y: v.y / d, z: v.z / d };
};
const K = norm(KEY); const F = norm(FILL); const R = norm(RIM);

export interface Lit { readonly diffuse: number; readonly sub: number; readonly spec: number }

/**
 * How much light a point receives, split into the parts skin treats
 * differently.
 */
export function light(n: Normal, ao: number, roughness: number): Lit {
  const dot = (v: typeof K): number => n.nx * v.x + n.ny * v.y + n.nz * v.z;

  // Wrapped diffuse: light does not stop dead at ninety degrees on skin.
  const wrap = (d: number, w: number): number => Math.max(0, (d + w) / (1 + w));
  const key = wrap(dot(K), 0.32);
  const fill = wrap(dot(F), 0.55) * 0.34;
  const rim = Math.pow(Math.max(0, dot(R)), 2.2) * 0.30;

  // The subsurface term lives just past the terminator, where light that went
  // in has come back out.
  const sub = Math.max(0, 0.34 - Math.abs(dot(K) - 0.12)) * 1.5;

  // Broad, weak specular. Blinn-Phong against the key's half-vector.
  const hx = K.x; const hy = K.y; const hz = K.z + 1;
  const hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
  const nh = Math.max(0, (n.nx * hx + n.ny * hy + n.nz * hz) / hl);
  const spec = Math.pow(nh, 12 + roughness * 40) * (0.16 + roughness * 0.10);

  return {
    diffuse: (key * 0.92 + fill + rim) * ao,
    sub: sub * ao,
    spec: spec * Math.min(1, ao + 0.25),
  };
}
