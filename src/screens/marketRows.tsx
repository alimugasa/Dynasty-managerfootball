// The parts the two market screens share.
//
// A waiver player and a free agent are the same man asked about twice, and a
// manager comparing them should not have to translate between two layouts. So
// the row is one component, the money is formatted one way, and the small
// facts -- what he is, how old, how good, how long he has been doing it -- sit
// in the same order on both screens.
//
// What differs is the one thing that actually differs: a waiver row carries a
// deadline and a claim count, and a free agent carries an asking price. Those
// are the trailing slot, and nothing else moves.

import type { ReactNode } from 'react';
import { COLOR, R, S, TYPE, tint } from '../app/tokens';
import { ListRow } from '../components/ListRow';

/**
 * Money as a manager says it out loud.
 *
 * Null is a dash, never a zero: "we have no figure for what he wants" and "he
 * will play for nothing" are different sentences, and only one of them is ever
 * true.
 *
 * The sign goes in front of the currency rather than inside it, because a club
 * over the cap is the case this figure matters most in -- seven of the
 * thirty-two are, in a typical season -- and "$-10.3M" reads as a typo at a
 * glance while "-$10.3M" reads as a debt.
 */
export function money(n: number | null): string {
  if (n === null) return '—';
  const sign = n < 0 ? '-' : '';
  const size = Math.abs(n);
  if (size >= 1_000_000) return `${sign}$${(size / 1_000_000).toFixed(1)}M`;
  if (size >= 1_000) return `${sign}$${String(Math.round(size / 1_000))}K`;
  return `${sign}$${String(size)}`;
}

/** A rating, or a dash where the club has not scouted him. */
export const rating = (n: number | null): string => (n === null ? '—' : String(n));

export function Pill({ text, tone = 'quiet' }: {
  readonly text: string;
  readonly tone?: 'quiet' | 'warn' | 'good' | 'bad';
}) {
  const colour = tone === 'warn' ? COLOR.amber
    : tone === 'good' ? COLOR.teal
      : tone === 'bad' ? COLOR.red : COLOR.mut;
  return (
    <span
      style={{
        ...TYPE.micro, fontSize: 11, lineHeight: '16px',
        fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em',
        padding: '2px 6px', borderRadius: R.sm,
        color: colour, background: tint(colour, 0.12),
        border: `1px solid ${tint(colour, 0.4)}`,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

export interface MarketRowFacts {
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly overall: number;
  /** Null where the franchise's scouting settings hide it, and drawn as a dash
   *  rather than as the rating it happens to equal. */
  readonly potential: number | null;
  readonly experienceYears: number;
  readonly previousTeamName: string | null;
  readonly injuredWeeksOut: number | null;
}

/** The years a player has been doing this, said the way a broadcast says it. */
const service = (years: number): string =>
  (years === 0 ? 'Rookie' : `${String(years)} yr${years === 1 ? '' : 's'}`);

export function MarketRow({ p, trailing, onSelect, testId }: {
  readonly p: MarketRowFacts;
  readonly trailing: ReactNode;
  readonly onSelect: () => void;
  readonly testId: string;
}) {
  return (
    <div data-testid={testId}>
      <ListRow
        navigable
        onSelect={onSelect}
        leading={(
          <span
            style={{
              ...TYPE.micro, fontSize: 12, fontVariantNumeric: 'tabular-nums',
              width: 34, textAlign: 'center', color: COLOR.mut,
            }}
          >
            {p.position}
          </span>
        )}
        title={p.name}
        subtitle={[
          `${String(p.age)}y`,
          service(p.experienceYears),
          `OVR ${rating(p.overall)}`,
          `POT ${rating(p.potential)}`,
          p.previousTeamName ?? 'No club on record',
        ].join(' · ')}
        trailing={(
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {p.injuredWeeksOut !== null && (
              <Pill text={`OUT ${String(p.injuredWeeksOut)}w`} tone="bad" />
            )}
            {trailing}
          </span>
        )}
      />
    </div>
  );
}

/** A labelled figure inside a sheet: the terms of a deal, line by line. */
export function TermLine({ label, value, tone = 'default' }: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'default' | 'good' | 'bad' | 'warn';
}) {
  const colour = tone === 'good' ? COLOR.teal
    : tone === 'bad' ? COLOR.red
      : tone === 'warn' ? COLOR.amber : COLOR.tx;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: S[3], padding: `${String(S[1])}px 0`, minWidth: 0,
      }}
    >
      <span style={{ ...TYPE.micro, color: COLOR.mut }}>{label}</span>
      <span
        style={{
          ...TYPE.body, color: colour, fontVariantNumeric: 'tabular-nums',
          textAlign: 'right', minWidth: 0,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * A likelihood, as a bar and a word.
 *
 * A bare percentage invites a manager to read precision into a model that does
 * not have any, so the number is shown alongside the band it falls in -- and
 * the band is what the colour tracks.
 */
export function Likelihood({ p }: { readonly p: number }) {
  const pct = Math.round(p * 100);
  const band = p >= 0.62 ? 'He signs' : p >= 0.4 ? 'He will talk' : 'Not close';
  const colour = p >= 0.62 ? COLOR.teal : p >= 0.4 ? COLOR.amber : COLOR.red;
  return (
    <div style={{ display: 'grid', gap: 6 }} data-testid="signing-likelihood">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: S[2] }}>
        <span style={{ ...TYPE.micro, color: COLOR.mut }}>Signing chance</span>
        <span style={{ ...TYPE.micro, color: colour, fontVariantNumeric: 'tabular-nums' }}>
          {String(pct)}% · {band}
        </span>
      </div>
      <div
        style={{
          height: 6, borderRadius: 3, background: COLOR.line, overflow: 'hidden',
        }}
      >
        <div style={{ width: `${String(pct)}%`, height: '100%', background: colour }} />
      </div>
    </div>
  );
}
