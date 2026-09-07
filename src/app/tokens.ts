// Typed mirror of src/app/tokens.css. Same values, for the places that need
// them in TypeScript rather than CSS. Extracted from legacy/ui/index.html.

export const COLOR = {
  ink: '#0F151B',
  panel: '#161F27',
  raise: '#1D2833',
  line: '#28353F',
  line2: '#33434F',
  tx: '#E8EEF4',
  mut: '#8698A8',
  dim: '#5E7080',
  amber: '#F0A830',
  teal: '#48C4AE',
  red: '#E2574C',
  blue: '#5B9BD5',
  violet: '#9B7BE0',
} as const;

/** Six-stop performance ramp: violet elite -> teal -> green -> amber -> orange -> red. */
export const GRADE_RAMP = [
  { key: 'elite', min: 90, color: '#9B7BE0' },
  { key: 'vgood', min: 80, color: '#48C4AE' },
  { key: 'good', min: 70, color: '#8FBF56' },
  { key: 'avg', min: 60, color: '#D9A441' },
  { key: 'poor', min: 50, color: '#D9743F' },
  { key: 'bad', min: -Infinity, color: '#C9483E' },
] as const;

export function gradeColor(grade: number): string {
  const stop = GRADE_RAMP.find((s) => grade >= s.min);
  return stop ? stop.color : '#C9483E';
}

export const LAYOUT = { navHeight: 60, shellMax: 520, minWidth: 320 } as const;

export const FONT = {
  display: "'Barlow Condensed', system-ui, sans-serif",
  ui: "'Inter', system-ui, -apple-system, sans-serif",
} as const;
