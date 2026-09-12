// One save file, as a card.
//
// A save has six things worth knowing before you open it -- team, GM, season,
// week, record, when it was last saved -- and ListRow's one title and one
// subtitle cannot carry them without truncating the record off the end. So the
// card lays them out itself: identity on top, the three figures in a row
// beneath, each under its own label.
//
// Anything the server could not tell us says so in place. A save whose GM was
// never named reports that; a season with no table yet reports that. Neither is
// filled in with a plausible value (ARCHITECTURE.md rule 3).

import type { ReactNode } from 'react';
import { COLOR, ELEV, FONT, R, S, TYPE, colourWash } from '../app/tokens';
import { TeamMark } from '../components/TeamMark';
import { ChevronRightIcon } from '../components/icons';
import { PHASE_LABEL } from '../domain/phase';
import type { SlotRow } from '../../supabase/functions/_shared/api/reads/slots';

/** The record, or an honest blank: a save whose table has not been written yet
 *  has no record, and 0-0 would be a claim rather than an absence. */
export function recordOf(slot: SlotRow): string {
  if (slot.wins === null || slot.losses === null) return '—';
  const ties = slot.ties !== null && slot.ties > 0 ? `-${String(slot.ties)}` : '';
  return `${String(slot.wins)}-${String(slot.losses)}${ties}`;
}

/** Where in the year it is. During the regular season the week is the useful
 *  half; outside it, the phase is. */
export function whenIn(slot: SlotRow): string {
  if (slot.season === null || slot.phase === null) return '—';
  if (slot.phase === 'REGULAR_SEASON' && slot.week !== null) {
    return `Wk ${String(slot.week)}`;
  }
  return PHASE_LABEL[slot.phase] ?? slot.phase;
}

/** Local date, short. The server sends an instant; the browser knows the zone
 *  and the server does not.
 *
 *  The year appears only when it is not this one. A column narrow enough for a
 *  320px phone cannot hold "Sep 9, 2026" without cutting it, and on a save made
 *  this year the year is the part carrying no information. */
export function savedAt(iso: string | null, now: Date = new Date()): string {
  if (iso === null) return '—';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return 'unreadable';
  const sameYear = when.getFullYear() === now.getFullYear();
  return when.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', ...(sameYear ? {} : { year: '2-digit' }),
  });
}

export function SlotNumber({ n, lit }: { readonly n: number; readonly lit: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 30, height: 30, flexShrink: 0, borderRadius: R.sm,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${lit ? COLOR.amber : COLOR.line}`,
        color: lit ? COLOR.amber : COLOR.dim,
        fontFamily: FONT.display, fontSize: 15, fontWeight: 600,
      }}
    >
      {n}
    </span>
  );
}

function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...TYPE.micro, fontSize: 10, color: COLOR.dim }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: FONT.display, fontSize: 14, fontWeight: 600, marginTop: 2,
          color: COLOR.tx, fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}

interface Props {
  readonly slot: SlotRow;
  /** Lit and tappable, or shown but not the thing to tap here. */
  readonly openable: boolean;
  readonly onOpen: () => void;
  /** What can be done to this file rather than with it -- deleting. It rides
   *  inside the card, under a hairline: a control floating below the card it
   *  acts on belongs to nothing on screen. */
  readonly footer?: ReactNode;
}

export function SlotCard({ slot, openable, onOpen, footer }: Props) {
  // A save file carries a franchise, so it wears that franchise's colour. The
  // wash is the team's primary laid over the app's ink at low alpha -- see
  // tokens.tint -- which is enough to tell three files apart at a glance and
  // not enough to fight the text on top of it.
  const wash = slot.primary === null || slot.secondary === null
    ? 'transparent'
    : colourWash(slot.primary, slot.secondary);

  const body = (
    <div
      style={{
        position: 'relative', display: 'grid', gap: S[3], padding: S[3],
        minWidth: 0, width: '100%', boxSizing: 'border-box', background: wash,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2], minWidth: 0 }}>
        <SlotNumber n={slot.slot} lit={openable} />
        {slot.primary !== null && slot.secondary !== null && slot.teamId !== null && (
          <TeamMark
            abbreviation={slot.teamId}
            primary={slot.primary}
            secondary={slot.secondary}
            size={30}
          />
        )}
        <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 1, textAlign: 'left' }}>
          <span
            style={{
              fontSize: 14, fontWeight: 600,
              color: openable ? COLOR.tx : COLOR.mut,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {slot.teamName ?? slot.teamId ?? 'Team unavailable'}
          </span>
          <span
            style={{
              fontFamily: FONT.display, fontSize: 12, letterSpacing: '0.05em',
              textTransform: 'uppercase', color: slot.gmName === null ? COLOR.dim : COLOR.mut,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {slot.gmName ?? 'No GM recorded'}
          </span>
        </span>
        {openable && (
          <span style={{ color: COLOR.dim, display: 'flex', flexShrink: 0 }}><ChevronRightIcon /></span>
        )}
      </div>
      <div
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: S[2], paddingLeft: 38,
        }}
      >
        <Figure label="Season" value={slot.season === null ? '—' : String(slot.season)} />
        <Figure label="At" value={whenIn(slot)} />
        <Figure label="Record" value={recordOf(slot)} />
        <Figure label="Saved" value={savedAt(slot.savedAt)} />
      </div>
    </div>
  );

  // The card is its own surface: three files stacked in one panel read as a
  // list of rows, and a save file is not a row -- it is the thing you are
  // choosing between.
  const shell = (inner: ReactNode) => (
    <div
      style={{
        borderRadius: R.md, overflow: 'hidden',
        border: `1px solid ${openable ? COLOR.line2 : COLOR.line}`,
        background: COLOR.panel,
        boxShadow: openable ? ELEV.mid : ELEV.low,
        opacity: openable ? 1 : 0.72,
      }}
    >
      {inner}
      {footer !== undefined && (
        <div
          style={{
            borderTop: `1px solid ${COLOR.line}`,
            background: 'rgba(0,0,0,0.16)',
            padding: `${String(S[2])}px ${String(S[3])}px`,
            display: 'flex', gap: S[2], justifyContent: 'flex-end',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );

  if (!openable) return shell(body);
  return shell(
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'block', width: '100%', background: 'none', border: 0,
        padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0,
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      {body}
    </button>,
  );
}
