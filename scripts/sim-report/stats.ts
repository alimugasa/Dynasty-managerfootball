// Distribution summaries. Percentiles come from the full sorted sample rather
// than from histogram bins, so a reported p95 is an actual observation and not
// an interpolation across a ten-yard bucket.

export interface Summary {
  readonly n: number;
  readonly mean: number;
  readonly sd: number;
  readonly min: number;
  readonly p05: number;
  readonly p25: number;
  readonly median: number;
  readonly p75: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export function summarize(values: ArrayLike<number>): Summary {
  const n = values.length;
  if (n === 0) {
    return {
      n: 0, mean: NaN, sd: NaN, min: NaN, p05: NaN, p25: NaN,
      median: NaN, p75: NaN, p95: NaN, p99: NaN, max: NaN,
    };
  }
  const sorted = Float64Array.from(values as ArrayLike<number>);
  sorted.sort();

  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += sorted[i] as number;
  const mean = sum / n;

  let variance = 0;
  for (let i = 0; i < n; i += 1) {
    const d = (sorted[i] as number) - mean;
    variance += d * d;
  }
  // Sample standard deviation.
  const sd = n > 1 ? Math.sqrt(variance / (n - 1)) : 0;

  const at = (q: number): number => {
    const idx = Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))));
    return sorted[idx] as number;
  };

  return {
    n, mean, sd,
    min: sorted[0] as number,
    p05: at(0.05), p25: at(0.25), median: at(0.5),
    p75: at(0.75), p95: at(0.95), p99: at(0.99),
    max: sorted[n - 1] as number,
  };
}

/** Share of the sample satisfying a predicate. */
export function shareWhere(values: ArrayLike<number>, test: (v: number) => boolean): number {
  let hits = 0;
  for (let i = 0; i < values.length; i += 1) if (test(values[i] as number)) hits += 1;
  return values.length === 0 ? NaN : hits / values.length;
}

export interface Bin {
  readonly from: number;
  readonly to: number;
  readonly count: number;
}

export function histogram(
  values: ArrayLike<number>, from: number, to: number, binWidth: number,
): Bin[] {
  const bins: number[] = new Array(Math.max(1, Math.ceil((to - from) / binWidth))).fill(0);
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i] as number;
    const idx = Math.floor((v - from) / binWidth);
    const clamped = idx < 0 ? 0 : idx >= bins.length ? bins.length - 1 : idx;
    bins[clamped] = (bins[clamped] ?? 0) + 1;
  }
  return bins.map((count, i) => ({
    from: from + i * binWidth,
    to: from + (i + 1) * binWidth,
    count,
  }));
}

