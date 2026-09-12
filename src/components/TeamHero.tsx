// The band at the top of the team screen: who you are, and how the year is
// going.
//
// Thirty-two teams ship two colours each and until now those colours lived in
// a 48px badge, which is the one place they cannot do any work. Here they wash
// across the whole band -- laid over the app's own ink at low alpha rather
// than used neat, because a kit colour is chosen to shout on a helmet and has
// to whisper behind text -- so opening the app looks different depending on
// who you manage. That is the difference between a franchise and a row in a
// table.
//
// The record is set as the one large figure on the screen. A season is a
// number; it should be read as one.

import { COLOR, ELEV, FONT, R, S, TYPE, colourWash } from '../app/tokens';
import { TeamMark } from './TeamMark';

interface Props {
  readonly abbreviation: string;
  readonly metro: string;
  readonly nickname: string;
  readonly primary: string;
  readonly secondary: string;
  /** The headline figure. An em dash where there is no record yet. */
  readonly record: string;
  /** What the figure is, in two or three words. */
  readonly recordLabel: string;
  /** Short facts along the foot: division, league position, squad size. */
  readonly facts: readonly { readonly label: string; readonly value: string }[];
}

export function TeamHero({
  abbreviation, metro, nickname, primary, secondary, record, recordLabel, facts,
}: Props) {
  return (
    <section
      style={{
        position: 'relative',
        borderRadius: R.lg,
        border: `1px solid ${COLOR.line}`,
        background: COLOR.panel,
        boxShadow: ELEV.mid,
        overflow: 'hidden',
      }}
    >
      {/* The colour, in two parts: a stripe along the top edge that runs one
          kit colour into the other, and a wash below it that only suggests
          them. The stripe blends rather than butting the two together, so a
          team whose primary is nearly black still reads as a stripe rather
          than as a gap with a colour stuck on one end. */}
      <div
        aria-hidden="true"
        style={{
          height: 3,
          background: `linear-gradient(90deg, ${primary} 0%, ${secondary} 100%)`,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: '3px 0 0 0', pointerEvents: 'none',
          background: colourWash(primary, secondary),
        }}
      />

      <div style={{ position: 'relative', padding: S[4] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[3], minWidth: 0 }}>
          <TeamMark
            abbreviation={abbreviation}
            primary={primary}
            secondary={secondary}
            size={52}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                ...TYPE.micro, color: COLOR.mut,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {metro}
            </div>
            <div
              style={{
                fontFamily: FONT.display, fontSize: 26, fontWeight: 700,
                letterSpacing: '0.01em', lineHeight: 1.1, color: COLOR.tx,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {nickname}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div
              className="numeric"
              style={{ ...TYPE.figure, fontSize: 30, color: COLOR.tx }}
            >
              {record}
            </div>
            <div style={{ ...TYPE.micro, color: COLOR.mut, marginTop: 3 }}>{recordLabel}</div>
          </div>
        </div>

        {facts.length > 0 && (
          <>
            <div
              aria-hidden="true"
              style={{
                height: 1, margin: `${String(S[3])}px 0`,
                background: `linear-gradient(90deg, ${COLOR.line2} 0%, ${COLOR.line} 60%, transparent 100%)`,
              }}
            />
            <div style={{ display: 'flex', gap: S[5], minWidth: 0, flexWrap: 'wrap' }}>
              {facts.map((f) => (
                <div key={f.label} style={{ minWidth: 0 }}>
                  <div style={{ ...TYPE.micro, fontSize: 10, color: COLOR.dim }}>{f.label}</div>
                  <div
                    className="numeric"
                    style={{
                      fontFamily: FONT.display, fontSize: 15, fontWeight: 600,
                      color: COLOR.tx, marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {f.value}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
