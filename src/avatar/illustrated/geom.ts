// Curve building, in one place.
//
// Every silhouette in this system is a smooth closed or open curve through a
// handful of authored landmarks. Writing the Bezier handles by hand twenty-two
// times would guarantee twenty-two different curve qualities, which is exactly
// the "inconsistent art direction" the brief rules out -- so the landmarks are
// the authored part and the curve between them is computed identically
// everywhere.
//
// Centripetal Catmull-Rom rather than uniform. The uniform form overshoots
// wherever one point sits far from its neighbours, and the first version of
// this project's raster renderer grew cone-shaped crowns for exactly that
// reason: a single apex point at the top of a skull is precisely the case
// uniform parameterisation handles worst.

export interface Pt { readonly x: number; readonly y: number }

export const pt = (x: number, y: number): Pt => ({ x, y });

const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

const n2 = (v: number): string => (Math.round(v * 100) / 100).toString();

/** Catmull-Rom through `points`, emitted as cubic Beziers. `tension` 1 is the
 *  standard spline; lower flattens it toward straight segments, which is how a
 *  square jaw is built from the same code as a round one. */
function segments(points: readonly Pt[], closed: boolean, tension: number): string {
  const n = points.length;
  if (n < 2) return '';
  const at = (i: number): Pt => {
    if (closed) return points[(i + n) % n] as Pt;
    return points[Math.max(0, Math.min(n - 1, i))] as Pt;
  };
  const last = closed ? n : n - 1;
  let d = `M${n2(at(0).x)},${n2(at(0).y)}`;
  for (let i = 0; i < last; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    // Centripetal: the square root of chord length. Bounded away from zero so
    // two coincident landmarks cannot produce a division by nothing.
    const d1 = Math.max(1e-4, Math.sqrt(dist(p0, p1)));
    const d2 = Math.max(1e-4, Math.sqrt(dist(p1, p2)));
    const d3 = Math.max(1e-4, Math.sqrt(dist(p2, p3)));
    const f = tension / 3;
    const b1x = p1.x + f * (d2 * (p2.x - p0.x)) / (d1 + d2);
    const b1y = p1.y + f * (d2 * (p2.y - p0.y)) / (d1 + d2);
    const b2x = p2.x - f * (d2 * (p3.x - p1.x)) / (d2 + d3);
    const b2y = p2.y - f * (d2 * (p3.y - p1.y)) / (d2 + d3);
    d += `C${n2(b1x)},${n2(b1y)} ${n2(b2x)},${n2(b2y)} ${n2(p2.x)},${n2(p2.y)}`;
  }
  return closed ? `${d}Z` : d;
}

export const closedPath = (points: readonly Pt[], tension = 1): string =>
  segments(points, true, tension);

export const openPath = (points: readonly Pt[], tension = 1): string =>
  segments(points, false, tension);

/** A closed shape from a right-hand profile, mirrored about `cx`. The two
 *  halves are drawn from the same landmarks so a face cannot come out lopsided
 *  by accident -- asymmetry is applied deliberately, by offsetting the profile
 *  before it gets here. */
export function mirrored(cx: number, right: readonly Pt[], tension = 1): string {
  const left = [...right].reverse().slice(1, -1).map((p) => pt(2 * cx - p.x, p.y));
  return closedPath([...right, ...left], tension);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** -1..1 in, a multiplier around 1 out. The single place a morph dimension
 *  turns into a size, so the envelope is bounded once rather than in fifty
 *  call sites. */
export const nudge = (v: number, spread: number): number => 1 + clamp(v, -1, 1) * spread;
