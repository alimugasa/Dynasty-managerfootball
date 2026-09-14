// One save file, as a card.
//
// A filled file has more worth knowing than a row can hold -- the franchise,
// who manages it, where the year has got to, the record, the cap and the
// trophy count -- so the card lays them out itself: the file and when it was
// last touched along the top, the franchise in the middle, and the four
// figures in a strip along the foot.
//
// Anything the server could not tell us says so in place. A save whose GM was
// never named reports that; a season with no table yet reports that; a cap
// sheet that has not been written reports that rather than claiming zero
// dollars of space (ARCHITECTURE.md rule 3).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { COLOR, ELEV, FONT, MOTION, R, S, TAP, TYPE, colourWash } from '../app/tokens';
import { TeamMark } from '../components/TeamMark';
import { ChevronRightIcon, MoreIcon } from '../components/icons';
import { capOf, recordOf, savedAt, whenIn } from './slotFacts';
import type { SlotRow } from '../../supabase/functions/_shared/api/reads/slots';

// Re-exported so the card stays the one import a screen or a test needs.
export { capOf, recordOf, savedAt, whenIn };

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

/**
 * A file with nothing in it.
 *
 * Drawn as a dashed outline rather than a filled card, because that is what
 * empty looks like: the edge says the space is real and the space is free.
 * Starting a franchise it is the thing to tap and says so in gold; loading one
 * it is dimmed and inert, because there is nothing in it to load.
 */
export function EmptySlotCard({ n, lit, onSelect }: {
  readonly n: number;
  /** New-franchise mode. Gold, chevroned, and the thing to tap. */
  readonly lit: boolean;
  /** Called on tap in either mode -- in load mode so the screen can say why
   *  nothing happened, rather than the tap landing on nothing at all. */
  readonly onSelect?: () => void;
}) {
  const inner = (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: S[3],
        padding: `${String(S[5])}px ${String(S[3])}px`,
        border: `1px dashed ${lit ? COLOR.line2 : COLOR.line}`,
        borderRadius: R.md,
        background: lit ? 'rgba(240,168,48,0.04)' : 'rgba(0,0,0,0.12)',
        minWidth: 0, width: '100%', boxSizing: 'border-box',
        // Dimmed in load mode: it is visible, so the file list is still three
        // files long, but it is plainly not a thing that will do anything.
        opacity: lit ? 1 : 0.55,
      }}
    >
      <SlotNumber n={n} lit={lit} />
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2, textAlign: 'left' }}>
        <span style={{ ...TYPE.body, fontSize: 15, fontWeight: 600, color: COLOR.tx }}>
          File {n}
        </span>
        <span style={{ ...TYPE.micro, color: lit ? COLOR.amber : COLOR.dim }}>
          {lit ? 'Empty · start here' : 'Empty'}
        </span>
      </span>
      {lit && (
        <span style={{ color: COLOR.dim, display: 'flex', flexShrink: 0 }}><ChevronRightIcon /></span>
      )}
    </div>
  );
  if (onSelect === undefined) return inner;
  return (
    <button
      type="button"
      onClick={onSelect}
      // Dimmed in load mode, but neither `disabled` nor `aria-disabled`: both
      // announce a control that cannot be used, and this one can -- tapping it
      // is how the screen gets to say why the file is no use for loading. A
      // button that calls itself disabled and then answers a tap is telling
      // two different stories.
      style={{
        display: 'block', width: '100%', background: 'none', border: 0,
        padding: 0, textAlign: 'left', cursor: lit ? 'pointer' : 'default', minWidth: 0,
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      {inner}
    </button>
  );
}

/** One of the four figures along the foot of a filled card. */
function Figure({ label, value, tone = 'default' }: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'default' | 'negative';
}) {
  return (
    <div style={{ minWidth: 'max-content' }}>
      <div style={{ ...TYPE.micro, fontSize: 10, color: COLOR.dim }}>{label}</div>
      <div
        className="numeric"
        style={{
          fontFamily: FONT.display, fontSize: 14, fontWeight: 600, marginTop: 2,
          color: tone === 'negative' ? COLOR.red : COLOR.tx,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** Rename and Delete, behind the three dots rather than beside the card. */
function Overflow({ slot, onRename, onDelete }: {
  readonly slot: number;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent): void => {
      if (!(e.target instanceof Node) || box.current?.contains(e.target) !== true) setOpen(false);
    };
    const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const item = (label: string, onClick: () => void, testId: string, danger = false): ReactNode => (
    <button
      type="button"
      data-testid={testId}
      onClick={() => { setOpen(false); onClick(); }}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        minHeight: 42, padding: `0 ${String(S[3])}px`,
        background: 'none', border: 0, cursor: 'pointer',
        color: danger ? COLOR.red : COLOR.tx,
        ...TYPE.body,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  );

  return (
    <div ref={box} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        aria-label={`Actions for file ${String(slot)}`}
        aria-expanded={open}
        data-testid={`slot-menu-${String(slot)}`}
        onClick={() => { setOpen((v) => !v); }}
        style={{
          // TAP square. The glyph stays small; the target around it does not.
          width: TAP, height: TAP, display: 'flex', alignItems: 'center',
          justifyContent: 'center', borderRadius: R.sm,
          background: open ? 'rgba(255,255,255,0.06)' : 'none',
          border: 0, cursor: 'pointer', color: open ? COLOR.tx : COLOR.dim,
          transition: `color ${MOTION.fast} ${MOTION.ease}`,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <MoreIcon />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 36, right: 0, zIndex: 30, minWidth: 168,
            background: COLOR.raise, border: `1px solid ${COLOR.line2}`,
            borderRadius: R.md, boxShadow: ELEV.high,
            padding: `${String(S[1])}px 0`, overflow: 'hidden',
          }}
        >
          {item('Rename File', onRename, `rename-${String(slot)}`)}
          {item('Delete File', onDelete, `delete-${String(slot)}`, true)}
        </div>
      )}
    </div>
  );
}

interface Props {
  readonly slot: SlotRow;
  /** Lit and tappable, or shown but not the thing to tap here. */
  readonly openable: boolean;
  readonly onOpen: () => void;
  readonly onRename?: () => void;
  readonly onDelete?: () => void;
}

export function SlotCard({ slot, openable, onOpen, onRename, onDelete }: Props) {
  // A save file carries a franchise, so it wears that franchise's colour. The
  // wash is the team's own primary laid over the app's ink at low alpha -- see
  // tokens.colourWash -- which is enough to tell three files apart at a glance
  // and not enough to fight the text on top of it.
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
            size={34}
          />
        )}
        <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 1, textAlign: 'left' }}>
          <span
            style={{
              ...TYPE.body, fontSize: 15, fontWeight: 600,
              color: openable ? COLOR.tx : COLOR.mut,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {slot.teamName ?? slot.teamId ?? 'Team unavailable'}
          </span>
          <span
            style={{
              ...TYPE.micro, color: slot.gmName === null ? COLOR.dim : COLOR.mut,
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

      {/* Four figures on one line where they fit, and two lines where they do
          not. Not a four-column grid: "2026 · Week 4" is three times the width
          of "0", and equal columns truncate the season to buy the trophy count
          room it has no use for. Each figure takes the width of its own
          content and the row wraps -- which is what happens at 320px, where
          four of these were never going to fit across. */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap',
          gap: `${String(S[2])}px ${String(S[4])}px`,
        }}
      >
        <Figure label="Season" value={whenIn(slot)} />
        <Figure label="Record" value={recordOf(slot)} />
        <Figure
          label="Cap"
          value={capOf(slot)}
          tone={slot.capSpace !== null && slot.capSpace < 0 ? 'negative' : 'default'}
        />
        <Figure label="Titles" value={String(slot.titles)} />
      </div>
    </div>
  );

  // The card is its own surface: three files stacked in one panel read as a
  // list of rows, and a save file is not a row -- it is the thing you are
  // choosing between.
  return (
    <div
      style={{
        borderRadius: R.md, overflow: 'visible',
        border: `1px solid ${openable ? COLOR.line2 : COLOR.line}`,
        background: COLOR.panel,
        boxShadow: openable ? ELEV.mid : ELEV.low,
        opacity: openable ? 1 : 0.72,
      }}
    >
      {/* The file, when it was last touched, and what can be done to it. Its
          own line above the franchise, so the overflow control is never inside
          the tap target that opens the save. */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: S[2],
          padding: `${String(S[1])}px ${String(S[2])}px ${String(S[1])}px ${String(S[3])}px`,
          borderBottom: `1px solid ${COLOR.line}`,
          minHeight: 38,
        }}
      >
        <span style={{ ...TYPE.micro, fontSize: 10, color: COLOR.dim, flexShrink: 0 }}>
          File {slot.slot}
        </span>
        {/* The file's name, but only once it is telling you something. It is
            created as the GM's name, which is already on the card below, so
            printing it here unrenamed would say the same thing twice. Rename
            it and it appears. */}
        {slot.name !== null && slot.name !== slot.gmName && (
          <span
            style={{
              ...TYPE.body, fontSize: 12, color: COLOR.mut, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {slot.name}
          </span>
        )}
        <span
          style={{
            ...TYPE.micro, fontSize: 10, color: COLOR.dim,
            marginLeft: 'auto', flexShrink: 0,
          }}
        >
          {savedAt(slot.savedAt)}
        </span>
        {onRename !== undefined && onDelete !== undefined && (
          <Overflow slot={slot.slot} onRename={onRename} onDelete={onDelete} />
        )}
      </div>

      {openable ? (
        <button
          type="button"
          onClick={onOpen}
          // Named, because the overflow control sits above this one in the DOM
          // and "the first button in the card" is now the wrong answer to
          // "which one opens the save".
          data-testid={`open-slot-${String(slot.slot)}`}
          style={{
            display: 'block', width: '100%', background: 'none', border: 0,
            padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0,
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          }}
        >
          {body}
        </button>
      ) : body}
    </div>
  );
}
