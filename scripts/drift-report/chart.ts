// Plain-text line chart. The question this answers is "is the line flat", which
// a chart settles at a glance and a column of numbers does not.

export interface ChartOptions {
  readonly height: number;
  readonly label: string;
  /** Drawn as a horizontal reference, normally the starting level. */
  readonly reference?: number;
  /** Shaded band around the reference marking acceptable drift. */
  readonly band?: number;
}

export function lineChart(values: readonly number[], options: ChartOptions): string {
  if (values.length === 0) return `  ${options.label}: no data`;
  const height = Math.max(5, options.height);

  // Folded rather than spread: a caller charting a long series would otherwise
  // overflow the stack on the argument list.
  let low = values.reduce((a, b) => (b < a ? b : a), Infinity);
  let high = values.reduce((a, b) => (b > a ? b : a), -Infinity);
  if (options.reference !== undefined) {
    low = Math.min(low, options.reference - (options.band ?? 0));
    high = Math.max(high, options.reference + (options.band ?? 0));
  }
  // Always show at least a two-point window, so a genuinely flat line does not
  // get magnified into a mountain range by autoscaling.
  const centre = (low + high) / 2;
  if (high - low < 2) { low = centre - 1; high = centre + 1; }
  const pad = (high - low) * 0.1;
  low -= pad;
  high += pad;

  const rowFor = (value: number): number =>
    Math.round(((high - value) / (high - low)) * (height - 1));

  const grid: string[][] = Array.from({ length: height }, () =>
    new Array<string>(values.length).fill(' '));

  if (options.reference !== undefined) {
    const refRow = rowFor(options.reference);
    if (refRow >= 0 && refRow < height) {
      grid[refRow] = new Array<string>(values.length).fill('.');
    }
    if (options.band !== undefined && options.band > 0) {
      for (const edge of [options.reference + options.band, options.reference - options.band]) {
        const row = rowFor(edge);
        if (row >= 0 && row < height) grid[row] = new Array<string>(values.length).fill('-');
      }
    }
  }

  values.forEach((value, x) => {
    const y = rowFor(value);
    if (y >= 0 && y < height) {
      const row = grid[y];
      if (row !== undefined) row[x] = 'o';
    }
  });

  const lines = [`  ${options.label}`];
  for (let y = 0; y < height; y += 1) {
    const value = high - (y / (height - 1)) * (high - low);
    lines.push(`  ${value.toFixed(2).padStart(7)} | ${(grid[y] ?? []).join('')}`);
  }
  lines.push(`  ${' '.repeat(7)} +${'-'.repeat(values.length)}`);
  const first = '1';
  const last = String(values.length);
  const axis = first + ' '.repeat(Math.max(1, values.length - first.length - last.length)) + last;
  lines.push(`  ${' '.repeat(7)}  ${axis}`);
  return lines.join('\n');
}

/** Ordinary least squares slope, in units per step. The drift number. */
export function slopePerStep(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  let meanY = 0;
  for (const v of values) meanY += v;
  meanY /= n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - meanX;
    num += dx * ((values[i] as number) - meanY);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}
