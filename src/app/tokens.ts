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

export const FONT = {
  display: "'Barlow Condensed', system-ui, sans-serif",
  ui: "'Inter', system-ui, -apple-system, sans-serif",
} as const;

export const LAYOUT = { navHeight: 60, shellMax: 520, minWidth: 320 } as const;

/** Corner radius. A chip, a card, a hero, a control -- and nothing between. */
export const R = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

/**
 * Elevation.
 *
 * A dark interface cannot lift a surface with a drop shadow alone: black on
 * near-black is invisible. Each step pairs a shadow below with a one-pixel
 * highlight along the top edge, and the highlight is what actually reads as
 * "this sits above that".
 */
export const ELEV = {
  flat: 'none',
  low: '0 1px 2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
  mid: '0 2px 8px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
  high: '0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.09)',
} as const;

/** A four-based space scale. Nothing lands between two steps. */
export const S = {
  1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40,
} as const;

/**
 * The type scale.
 *
 * Two faces doing two jobs. Barlow Condensed is the scoreboard -- headings,
 * micro-labels and every figure, because condensed numerals fit a phone column
 * and tabular ones stop a table dancing as it updates. Inter is everything a
 * person reads as a sentence.
 */
export const TYPE = {
  /** A screen title. */
  display: { fontFamily: FONT.display, fontSize: 24, fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1.05 },
  /** A section heading. */
  heading: { fontFamily: FONT.display, fontSize: 15, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const },
  /** The small uppercase label over a figure or beside a row. */
  micro: { fontFamily: FONT.display, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' as const },
  /** A row's first line. */
  body: { fontFamily: FONT.ui, fontSize: 14, fontWeight: 500, lineHeight: 1.35 },
  /** Running prose. */
  prose: { fontFamily: FONT.ui, fontSize: 13, fontWeight: 400, lineHeight: 1.55 },
  /** A figure that is the point of its tile. */
  figure: { fontFamily: FONT.display, fontSize: 26, fontWeight: 600, letterSpacing: '0.01em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' as const },
} as const;

/** Motion. Fast enough to read as feedback rather than as animation. */
export const MOTION = {
  fast: '110ms',
  base: '200ms',
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

/** A team's own colour, softened to something a surface can be tinted with.
 *  Kit colours are chosen to shout on a helmet; behind text they have to
 *  whisper, so they are laid over the app's own ink rather than used neat. */
export const tint = (hex: string, alpha: number): string => {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return 'transparent';
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
};

/**
 * The wash a team's colours make behind a band of text.
 *
 * One expression, used by every surface that belongs to a team -- the team
 * hero, a save file card, a player's profile -- so a franchise looks the same
 * wherever it appears. It fades out well before the right-hand side, which is
 * where a record or a rating sits and where a colour would fight it.
 */
export const colourWash = (primary: string, secondary: string): string =>
  `linear-gradient(112deg, ${tint(primary, 0.3)} 0%, ${tint(primary, 0.1)} 44%,`
  + ` ${tint(secondary, 0.09)} 72%, transparent 100%)`;
