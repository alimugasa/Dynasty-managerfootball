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

import { COLOR, FONT } from '../app/tokens';
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
        width: 30, height: 30, flexShrink: 0, borderRadius: 6,
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
      <div
        style={{
          fontFamily: FONT.display, fontSize: 10, letterSpacing: '0.09em',
          textTransform: 'uppercase', color: COLOR.dim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: COLOR.tx, fontSize: 13, fontVariantNumeric: 'tabular-nums',
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
}

export function SlotCard({ slot, openable, onOpen }: Props) {
  const body = (
    <div style={{ display: 'grid', gap: 8, padding: '10px 0', minWidth: 0, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
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
          gap: 8, paddingLeft: 40,
        }}
      >
        <Figure label="Season" value={slot.season === null ? '—' : String(slot.season)} />
        <Figure label="At" value={whenIn(slot)} />
        <Figure label="Record" value={recordOf(slot)} />
        <Figure label="Saved" value={savedAt(slot.savedAt)} />
      </div>
    </div>
  );

  if (!openable) return body;
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'block', width: '100%', background: 'none', border: 0,
        padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0,
      }}
    >
      {body}
    </button>
  );
}
