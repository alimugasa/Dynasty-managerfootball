// The GM you are about to be, as the game will hold him.
//
// It updates as you type, which is the point: the two fields above it are
// abstract until something shows you what they produce. Everything on it is
// either what you just entered or a fact about a manager who has not worked a
// day -- a career record of 0-0 and a legacy not started are true of him, not
// placeholders standing in for figures we could not find. Reputation is the one
// line that says "unknown", because nobody in this league has an opinion of a
// man they have not met.

import { COLOR, ELEV, FONT, R, S, TYPE, tint } from '../app/tokens';
import { gmStyleLabel } from './gmStyles';

/** The initials, once both names exist. One letter each: a monogram of three
 *  letters from two fields is a guess about middle names nobody gave us. */
export function initialsOf(first: string, last: string): string | null {
  const f = first.trim();
  const l = last.trim();
  if (f === '' || l === '') return null;
  return `${f[0] ?? ''}${l[0] ?? ''}`.toUpperCase();
}

function Avatar({ initials }: { readonly initials: string | null }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 44, height: 44, flexShrink: 0, borderRadius: R.pill,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: initials === null ? 'rgba(0,0,0,0.22)' : tint(COLOR.amber, 0.14),
        border: `1px solid ${initials === null ? COLOR.line : tint(COLOR.amber, 0.55)}`,
        color: initials === null ? COLOR.dim : COLOR.amber,
        fontFamily: FONT.display, fontWeight: 600, fontSize: 17, letterSpacing: '0.04em',
        boxShadow: initials === null ? 'none' : `0 0 14px ${tint(COLOR.amber, 0.16)}`,
        transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease',
      }}
    >
      {/* A dash, not an empty circle: the slot for a face is visibly waiting
          for one rather than looking like a thing that failed to load. */}
      {initials ?? '–'}
    </div>
  );
}

function Line({ label, value, accent = false }: {
  readonly label: string;
  readonly value: string;
  readonly accent?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: S[3], minWidth: 0,
      }}
    >
      <span style={{ ...TYPE.micro, color: COLOR.dim, flexShrink: 0 }}>{label}</span>
      <span
        className="numeric"
        style={{
          ...TYPE.body, color: accent ? COLOR.amber : COLOR.tx,
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function GmPreview({ first, last, style, slot }: {
  readonly first: string;
  readonly last: string;
  readonly style: string;
  /** The save file this manager is being created in. */
  readonly slot: number | null;
}) {
  const initials = initialsOf(first, last);
  const name = `${first.trim()} ${last.trim()}`.trim();
  const named = name !== '';
  const styleLabel = gmStyleLabel(style);

  return (
    <section
      data-testid="gm-preview"
      aria-live="polite"
      style={{
        background: COLOR.raise,
        border: `1px solid ${COLOR.line2}`,
        borderRadius: R.md,
        boxShadow: ELEV.mid,
        padding: S[4],
        minWidth: 0,
      }}
    >
      <p style={{ ...TYPE.micro, margin: 0, color: COLOR.dim }}>GM Preview</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: S[3], margin: `${String(S[3])}px 0 0`, minWidth: 0 }}>
        <Avatar initials={initials} />
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              ...TYPE.heading, margin: 0, fontSize: 17, letterSpacing: '0.02em',
              textTransform: 'none',
              color: named ? COLOR.tx : COLOR.dim,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {named ? name : 'Name not entered yet'}
          </p>
          {named && (
            <p style={{ ...TYPE.micro, margin: `${String(S[1])}px 0 0`, color: COLOR.mut }}>
              General Manager
            </p>
          )}
        </div>
      </div>

      {named && (
        <div
          style={{
            display: 'grid', gap: S[2],
            margin: `${String(S[4])}px 0 0`,
            paddingTop: S[3],
            borderTop: `1px solid ${COLOR.line}`,
          }}
        >
          {styleLabel !== null && <Line label="Style" value={styleLabel} accent />}
          <Line label="Reputation" value="Unknown" />
          <Line label="Career record" value="0-0" />
          <Line label="Legacy" value="Not started" />
          {/* Reported, not defaulted: a preview rendered outside the flow has
              no file to name, and saying so beats printing File 1. */}
          <Line label="Save file" value={slot === null ? 'Not chosen' : `File ${String(slot)}`} />
        </div>
      )}
    </section>
  );
}
