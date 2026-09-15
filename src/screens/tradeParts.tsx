// The pieces the Trade Center is built from.
//
// Three of them carry the weight. The interest meter is the thing a manager
// actually watches while building a package -- it is the feedback loop the
// whole screen exists to provide. The asset row is used four times over (their
// players, their picks, yours, yours) and has to read identically each time,
// because a trade is symmetrical and a builder that looked different on each
// side would make a two-sided decision harder than it is.
//
// The third is the reason list. A band on its own is a score; the reasons are
// what tell a manager which way to move, and they are the difference between
// a negotiation and a guessing game.

import type { ReactNode } from 'react';
import { COLOR, R, S, TYPE, tint } from '../app/tokens';
import { Caption } from '../components/Surface';
import { money } from './marketRows';
import type { Interest } from '../../supabase/functions/_shared/api/tradeInterest';

const BAND_LABEL: Readonly<Record<Interest, string>> = {
  NO_INTEREST: 'No interest', WEAK: 'Weak', FAIR: 'Fair',
  STRONG: 'Strong', LIKELY_ACCEPT: 'Likely accept',
};

const BAND_COLOR: Readonly<Record<Interest, string>> = {
  NO_INTEREST: COLOR.red, WEAK: COLOR.red, FAIR: COLOR.amber,
  STRONG: COLOR.amber, LIKELY_ACCEPT: COLOR.teal,
};

/**
 * How close the deal is, and why it is not closer.
 *
 * The bar is the same number the server used, not a re-derivation: a meter
 * that disagreed with the answer it precedes would be worse than no meter.
 */
export function InterestMeter({ interest, fill, reasons, blocked }: {
  readonly interest: Interest;
  readonly fill: number;
  readonly reasons: readonly string[];
  readonly blocked: string | null;
}) {
  const colour = BAND_COLOR[interest];
  const pct = Math.round(fill * 100);
  return (
    <div data-testid="interest-meter" style={{ display: 'grid', gap: S[2] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: S[2] }}>
        <span style={{ ...TYPE.micro, color: COLOR.mut }}>Their interest</span>
        <span
          data-testid="interest-band"
          style={{ ...TYPE.micro, color: colour, fontVariantNumeric: 'tabular-nums' }}
        >
          {BAND_LABEL[interest]}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: COLOR.line, overflow: 'hidden' }}>
        <div style={{ width: `${String(pct)}%`, height: '100%', background: colour }} />
      </div>
      {/* A refusal no package fixes is a different kind of answer from "not
          enough", and is said differently so a manager stops building rather
          than adding another pick to a deal that was never possible. */}
      {blocked !== null && (
        <p
          data-testid="trade-blocked"
          style={{ ...TYPE.prose, margin: 0, color: COLOR.red }}
        >
          {blocked}
        </p>
      )}
      {blocked === null && reasons.length > 0 && (
        <ul
          data-testid="trade-reasons"
          style={{ margin: 0, padding: `0 0 0 ${String(S[4])}px`, display: 'grid', gap: 2 }}
        >
          {reasons.map((reason) => (
            <li key={reason} style={{ ...TYPE.prose, color: COLOR.mut }}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface AssetChoice {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly value: number;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

/**
 * One asset, on or off the table.
 *
 * A checkbox rather than a drag: on a phone, dragging a player between two
 * columns is a gesture that fails often and silently, and a package is a set
 * rather than an arrangement.
 */
export function AssetToggle({ asset, selected, onToggle }: {
  readonly asset: AssetChoice;
  readonly selected: boolean;
  readonly onToggle: () => void;
}) {
  const off = asset.disabled === true;
  return (
    <button
      type="button"
      onClick={off ? undefined : onToggle}
      disabled={off}
      aria-pressed={selected}
      data-testid={`asset-${asset.key}`}
      style={{
        display: 'flex', alignItems: 'center', gap: S[3], width: '100%',
        minHeight: 52, padding: `${String(S[2])}px ${String(S[3])}px`,
        boxSizing: 'border-box', textAlign: 'left',
        background: selected ? tint(COLOR.amber, 0.14) : 'transparent',
        border: `1px solid ${selected ? tint(COLOR.amber, 0.55) : COLOR.line}`,
        borderRadius: R.sm,
        color: off ? COLOR.dim : COLOR.tx,
        cursor: off ? 'not-allowed' : 'pointer',
        opacity: off ? 0.7 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18, height: 18, flexShrink: 0, borderRadius: 4,
          border: `1px solid ${selected ? COLOR.amber : COLOR.line}`,
          background: selected ? COLOR.amber : 'transparent',
        }}
      />
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span
          style={{
            ...TYPE.body, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {asset.label}
        </span>
        <span
          style={{
            ...TYPE.micro, fontSize: 11, color: off ? COLOR.dim : COLOR.mut,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {off ? asset.disabledReason ?? 'Not available' : asset.detail}
        </span>
      </span>
      {/* What this club thinks it is worth. Shown because a manager building a
          package against a hidden number is guessing, and guessing is not
          negotiating. */}
      <span
        style={{
          ...TYPE.micro, color: COLOR.mut, flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {asset.value.toFixed(1)}
      </span>
    </button>
  );
}

/** A club's direction and what it is short of, which is the whole reason a
 *  manager picks up the phone to one club rather than another. */
export function ClubLine({ name, strategy, record, needs, capSpace, onSelect, testId }: {
  readonly name: string;
  readonly strategy: string;
  readonly record: string;
  readonly needs: readonly string[];
  readonly capSpace: number;
  readonly onSelect: () => void;
  readonly testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testId}
      style={{
        display: 'flex', alignItems: 'center', gap: S[3], width: '100%',
        minHeight: 56, padding: `${String(S[2])}px ${String(S[3])}px`,
        boxSizing: 'border-box', textAlign: 'left',
        background: 'transparent', border: `1px solid ${COLOR.line}`,
        borderRadius: R.sm, color: COLOR.tx, cursor: 'pointer',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span style={{ ...TYPE.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
        <span
          style={{
            ...TYPE.micro, fontSize: 11, color: COLOR.mut,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {[strategy, record, needs.length === 0 ? 'No pressing needs' : `Needs ${needs.join(', ')}`]
            .join(' · ')}
        </span>
      </span>
      <span style={{ ...TYPE.micro, color: COLOR.mut, flexShrink: 0 }}>
        {money(capSpace)}
      </span>
    </button>
  );
}

/** A trade as the history shows it: who sent what, which way. */
export function TradeLine({ title, sending, receiving, footer, actions }: {
  readonly title: string;
  readonly sending: readonly string[];
  readonly receiving: readonly string[];
  readonly footer?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid', gap: S[2], padding: `${String(S[3])}px 0`,
        borderBottom: `1px solid ${COLOR.line}`, minWidth: 0,
      }}
    >
      <span style={{ ...TYPE.body, color: COLOR.tx }}>{title}</span>
      <div style={{ display: 'grid', gap: 2 }}>
        <span style={{ ...TYPE.prose, color: COLOR.mut }}>
          {`→ ${sending.length === 0 ? 'nothing' : sending.join(', ')}`}
        </span>
        <span style={{ ...TYPE.prose, color: COLOR.mut }}>
          {`← ${receiving.length === 0 ? 'nothing' : receiving.join(', ')}`}
        </span>
      </div>
      {footer !== undefined && <Caption>{footer}</Caption>}
      {actions}
    </div>
  );
}
