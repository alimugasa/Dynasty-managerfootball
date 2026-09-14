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

import { COLOR, ELEV, FONT, R, S, TYPE, colourWash, tint } from '../app/tokens';
import { TeamMark } from './TeamMark';

/** A short phrase about the club, worn under its name. Two at most: three
 *  pills in a row stop being a summary and start being a paragraph. */
export interface HeroTag {
  readonly label: string;
  /** What the phrase is, in one word, so "Win now" is not mistaken for the
   *  owner having asked for it. */
  readonly kind: string;
  /** Amber for what the owner wants, quiet for what the roster is. */
  readonly accent?: boolean;
}

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
  /** Where the club stands and what has been asked of it. */
  readonly tags?: readonly HeroTag[];
}

export function TeamHero({
  abbreviation, metro, nickname, primary, secondary, record, recordLabel, facts,
  tags = [],
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
              // The one large figure on the screen. A season is a number and
              // should be read as one, from across a desk.
              style={{ ...TYPE.figure, fontSize: 34, color: COLOR.tx, lineHeight: 1 }}
            >
              {record}
            </div>
            <div style={{ ...TYPE.micro, color: COLOR.mut, marginTop: 3 }}>{recordLabel}</div>
          </div>
        </div>

        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: S[3], minWidth: 0 }}>
            {tags.map((t) => (
              <span
                key={t.label}
                data-testid={`hero-tag-${t.kind}`}
                style={{
                  ...TYPE.micro, fontSize: 9.5, whiteSpace: 'nowrap',
                  color: t.accent === true ? COLOR.amber : COLOR.mut,
                  background: t.accent === true ? tint(COLOR.amber, 0.1) : 'rgba(0,0,0,0.22)',
                  border: `1px solid ${t.accent === true ? tint(COLOR.amber, 0.4) : COLOR.line2}`,
                  borderRadius: R.pill, padding: '3px 9px',
                  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {t.label}
              </span>
            ))}
          </div>
        )}

        {facts.length > 0 && (
          <>
            <div
              aria-hidden="true"
              style={{
                height: 1, margin: `${String(S[3])}px 0`,
                background: `linear-gradient(90deg, ${COLOR.line2} 0%, ${COLOR.line} 60%, transparent 100%)`,
              }}
            />
            {/* Two across, however many rows that takes.
                Four in a row does not fit a phone -- "Cap space" and a
                division label together are wider than 390px leaves -- so the
                flex version wrapped three above one, which reads as a card
                that broke rather than one that wrapped. Four equal columns
                truncated instead, because these facts are nothing like the
                same width. Half the card each is the one arrangement that is
                deliberate at every width the app supports and never clips. */}
            <div
              style={{
                display: 'grid', gap: `${String(S[3])}px ${String(S[4])}px`,
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', minWidth: 0,
              }}
            >
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
