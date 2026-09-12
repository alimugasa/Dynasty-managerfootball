// The sort control: which field, and which way.
//
// Sorting is an explicit control rather than a tappable column header. On a
// phone a standings column is thirty pixels wide, a precise tap is hard, and a
// header that sorts one table while it navigates on another teaches the reader
// nothing reliable. So the field is chosen from a chip row and the direction is
// one separate tap, and both are plainly visible without a hover a phone does
// not have.
//
// The control knows nothing about the data: it is given fields with labels and
// reports the selection, and the screen does the sorting. That is what lets the
// same control serve the standings, the roster, a leaderboard and the record
// book.

import { COLOR, FONT } from '../app/tokens';
import { ChipRow, type Chip } from './ChipRow';

export interface SortField {
  readonly key: string;
  readonly label: string;
  /** Set on a field with no direction to reverse -- an original order that is
   *  a fact rather than a ranking, such as the league's own standing. */
  readonly fixed?: boolean;
}

interface Props {
  readonly fields: readonly SortField[];
  readonly value: string;
  readonly direction: 'asc' | 'desc';
  /** A field was chosen. The screen decides which way that field starts. */
  readonly onField: (key: string) => void;
  /** Reverse the current direction. One tap, always. */
  readonly onReverse: () => void;
  readonly label: string;
}

export function SortControl({ fields, value, direction, onField, onReverse, label }: Props) {
  const chips: readonly Chip[] = fields.map((f) => ({ key: f.key, label: f.label }));
  const active = fields.find((f) => f.key === value);
  const reversible = active !== undefined && active.fixed !== true;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <ChipRow chips={chips} value={value} onChange={onField} label={label} />
      </div>
      <button
        type="button"
        onClick={onReverse}
        disabled={!reversible}
        aria-label={direction === 'desc' ? 'Sorted high to low' : 'Sorted low to high'}
        title={reversible ? 'Reverse the order' : 'This order does not reverse'}
        style={{
          flexShrink: 0, minWidth: 44, minHeight: 32, borderRadius: 999,
          cursor: reversible ? 'pointer' : 'default',
          background: COLOR.panel,
          border: `1px solid ${COLOR.line}`,
          color: reversible ? COLOR.amber : COLOR.dim,
          fontFamily: FONT.display, fontSize: 13, fontWeight: 600, letterSpacing: '0.05em',
        }}
      >
        {reversible ? (direction === 'desc' ? '▼ HIGH' : '▲ LOW') : '—'}
      </button>
    </div>
  );
}
