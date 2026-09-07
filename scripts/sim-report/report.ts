// Rendering only. No analysis happens here; it prints what metrics.ts computed.
// Plain text with no terminal colour, so the report reads identically on a
// terminal, in a pipe, and in a file committed next to the code.

import { histogram, type Summary } from './stats.ts';
import type { Distributions, Merged, MetricResult } from './metrics.ts';

function fmt(value: number, unit: string): string {
  if (!Number.isFinite(value)) return '-';
  if (unit === 'share') return `${(value * 100).toFixed(2)}%`;
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

function range(low: number, high: number, unit: string): string {
  return unit === 'share'
    ? `${(low * 100).toFixed(2)}-${(high * 100).toFixed(2)}%`
    : `${low}-${high}`;
}

const RULE = '-'.repeat(78);

export function heading(text: string): string {
  return `\n${text.toUpperCase()}\n${RULE}`;
}

export function metricTable(rows: readonly MetricResult[]): string {
  const lines = ['  ' + 'metric'.padEnd(48) + 'value'.padStart(10) + '   ' +
    'target'.padEnd(15) + 'status'];
  for (const row of rows) {
    const mark = row.status === 'ok' ? 'ok' : row.status === 'above' ? 'HIGH' : 'LOW';
    lines.push(
      '  ' + row.label.padEnd(48) +
      fmt(row.value, row.unit).padStart(10) + '   ' +
      range(row.low, row.high, row.unit).padEnd(15) + mark,
    );
  }
  return lines.join('\n');
}

export function summaryTable(label: string, s: Summary, unit = ''): string {
  const cells: [string, number][] = [
    ['min', s.min], ['p05', s.p05], ['p25', s.p25], ['median', s.median],
    ['p75', s.p75], ['p95', s.p95], ['p99', s.p99], ['max', s.max],
  ];
  return [
    `  ${label}`,
    `    mean ${fmt(s.mean, unit)}   sd ${fmt(s.sd, unit)}   n ${s.n.toLocaleString()}`,
    '    ' + cells.map(([name]) => name.padStart(9)).join(''),
    '    ' + cells.map(([, v]) => fmt(v, unit).padStart(9)).join(''),
  ].join('\n');
}

export function chart(
  label: string, values: ArrayLike<number>, from: number, to: number, width: number,
): string {
  const bins = histogram(values, from, to, width);
  const peak = bins.reduce((max, b) => (b.count > max ? b.count : max), 0);
  const lines = [`  ${label}`];
  for (const bin of bins) {
    const share = values.length === 0 ? 0 : bin.count / values.length;
    const bars = peak === 0 ? 0 : Math.round((bin.count / peak) * 44);
    lines.push(
      '    ' + `${String(bin.from).padStart(4)}-${String(bin.to).padEnd(4)} ` +
      '#'.repeat(bars).padEnd(45) + `${(share * 100).toFixed(1)}%`,
    );
  }
  return lines.join('\n');
}

export function flagged(rows: readonly MetricResult[]): string {
  const bad = rows.filter((r) => r.status !== 'ok');
  if (bad.length === 0) {
    return '\nFLAGGED\n' + RULE + '\n  No metric fell outside its target range.';
  }
  const lines = [
    `\nFLAGGED - ${bad.length} metric${bad.length === 1 ? '' : 's'} outside range`,
    RULE,
    '  Nothing has been tuned. Listed worst-first, with the constants that move each.',
  ];
  const sorted = [...bad].sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
  sorted.forEach((row, i) => {
    const direction = row.status === 'above' ? 'above' : 'below';
    const pct = `${(Math.abs(row.deviation) * 100).toFixed(1)}%`;
    lines.push('');
    lines.push(`  ${i + 1}. ${row.label}`);
    lines.push(
      `     ${fmt(row.value, row.unit)} - ${direction} the ` +
      `${range(row.low, row.high, row.unit)} target by ${pct} of midpoint`,
    );
    for (const hint of row.tuning) lines.push(`     - ${hint}`);
  });
  return lines.join('\n');
}

export function header(m: Merged, seconds: number, targetsSource: string, seed: number): string {
  const games = m.points.length / 2;
  const lines = [
    'DYNASTY MANAGER PRO - SIMULATION DISTRIBUTION REPORT',
    RULE,
    `  seasons          ${m.seasons.toLocaleString()}`,
    `  games            ${games.toLocaleString()}`,
    `  team-games       ${m.points.length.toLocaleString()}`,
    `  team-seasons     ${m.wins.length.toLocaleString()}`,
    `  base seed        ${seed} (the same seed reproduces this report exactly)`,
    `  targets          ${targetsSource}`,
    `  elapsed          ${seconds.toFixed(1)}s`,
  ];
  if (m.abandonedGames > 0) {
    const detail = Object.entries(m.abandonedByGroup)
      .filter(([, count]) => count > 0)
      .map(([group, count]) => `${group} ${count}`)
      .join(', ');
    const rate = (m.abandonedGames / (games + m.abandonedGames)) * 100;
    lines.push(`  abandoned games  ${m.abandonedGames} (${rate.toFixed(3)}%) - no fieldable unit: ${detail}`);
  } else {
    lines.push('  abandoned games  0');
  }
  return lines.join('\n');
}

export function outliers(d: Distributions): string {
  const rows: [string, Summary][] = [
    ['season passing yards, leader', d.leaderPassYards],
    ['season rushing yards, leader', d.leaderRushYards],
    ['season receiving yards, leader', d.leaderRecYards],
    ['season passing touchdowns, leader', d.leaderPassTds],
    ['season sacks, leader', d.leaderSacks],
    ['best single game, passing yards', d.recordGamePassYards],
    ['best single game, rushing yards', d.recordGameRushYards],
  ];
  const lines = [
    '  Per-season bests. "max" is the most extreme seen across every season simulated,',
    '  which is the record book a long save would accumulate.',
    '',
    '  ' + 'category'.padEnd(38) + 'mean'.padStart(9) + 'median'.padStart(9) +
      'p95'.padStart(9) + 'max'.padStart(9),
  ];
  for (const [label, s] of rows) {
    lines.push(
      '  ' + label.padEnd(38) +
      fmt(s.mean, '').padStart(9) + fmt(s.median, '').padStart(9) +
      fmt(s.p95, '').padStart(9) + fmt(s.max, '').padStart(9),
    );
  }
  return lines.join('\n');
}
