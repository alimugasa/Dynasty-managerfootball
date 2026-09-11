import { COLOR, FONT, R, gradeColor, tint } from '../app/tokens';

/** PERFORMANCE — a rectangular chip with a coloured left edge on the six-stop
 *  ramp (violet elite -> teal -> green -> amber -> orange -> red).
 *
 *  Rectangular, with an edge. Never circular, never an arc. Nothing here may be
 *  configured to look like an AbilityDial: no colour prop, no variant prop. */
interface Props {
  value: number | null;
  label?: string;
}

export function PerformanceChip({ value, label = 'Grade' }: Props) {
  const unavailable = value === null;
  const edge = unavailable ? COLOR.line2 : gradeColor(value);
  return (
    <span
      role="img"
      aria-label={unavailable ? `${label} unavailable` : `${label} ${value.toFixed(1)}`}
      style={{
        display: 'inline-flex', alignItems: 'center', minHeight: 22,
        padding: '2px 8px 2px 6px',
        // The chip carries a breath of its own grade colour, so a row of
        // them reads as a ramp rather than as a column of grey boxes.
        background: unavailable ? COLOR.raise : tint(edge, 0.12),
        borderLeft: `4px solid ${edge}`,
        borderRadius: R.sm,
        fontFamily: FONT.ui,
        fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        color: unavailable ? COLOR.dim : COLOR.tx,
      }}
    >
      {unavailable ? '–' : value.toFixed(1)}
    </span>
  );
}
