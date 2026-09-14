// The matchup, and what is worth knowing before it is played.
//
// Two clubs either side of a label, rated on the same three numbers, so the
// comparison is the shape of the card rather than something a manager has to
// do in their head. The club you manage is always on the left, whoever is at
// home; the label in the middle is what says which of them that is.
//
// The prep cards under it are facts, not advice. Each one either reports a row
// the save holds or says plainly that the thing it names is not built -- and
// the one that is not built is drawn differently from the four that are, so
// "Balanced" is never mistaken for a gameplan somebody chose.

import type { ReactNode } from 'react';
import { COLOR, ELEV, FONT, R, S, TYPE, tint } from '../app/tokens';
import { TeamMark } from '../components/TeamMark';
import { bandColor } from './ratingRing';
import { Pill, difficultyColour } from './dashboardCards';
import type { DashboardOut } from '../../supabase/functions/_shared/api/reads/dashboard';
import type { RatingBand } from '../../supabase/functions/_shared/api/reads/teamOutlook';

export const recordOf = (
  r: { wins: number; losses: number; ties: number } | null,
): string => (r === null ? '—' : `${String(r.wins)}-${String(r.losses)}${r.ties > 0 ? `-${String(r.ties)}` : ''}`);

/** One club's three numbers, under its name. */
function Units({ offense, defense, overall, band }: {
  readonly offense: number | null;
  readonly defense: number | null;
  readonly overall: number | null;
  readonly band: RatingBand | null;
}) {
  const cell = (label: string, value: number | null, colour: string) => (
    <div key={label} style={{ minWidth: 0 }}>
      <div style={{ ...TYPE.micro, fontSize: 9, color: COLOR.dim }}>{label}</div>
      <div
        className="numeric"
        style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 600, color: colour }}
      >
        {value === null ? '—' : String(Math.round(value))}
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: S[3], marginTop: S[2], minWidth: 0 }}>
      {cell('OFF', offense, COLOR.tx)}
      {cell('DEF', defense, COLOR.tx)}
      {cell('OVR', overall, bandColor(band))}
    </div>
  );
}

function Side({ abbreviation, name, record, primary, secondary, offense, defense, overall, band }: {
  readonly abbreviation: string;
  readonly name: string;
  readonly record: string;
  readonly primary: string;
  readonly secondary: string;
  readonly offense: number | null;
  readonly defense: number | null;
  readonly overall: number | null;
  readonly band: RatingBand | null;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S[3], minWidth: 0 }}>
      <TeamMark abbreviation={abbreviation} primary={primary} secondary={secondary} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            ...TYPE.body, color: COLOR.tx, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        <div className="numeric" style={{ ...TYPE.micro, fontSize: 10, color: COLOR.mut, marginTop: 1 }}>
          {record}
        </div>
        <Units offense={offense} defense={defense} overall={overall} band={band} />
      </div>
    </div>
  );
}

/**
 * The card at the top of the Play tab.
 *
 * The bar between the two clubs carries the only three things that decide how
 * to read the rest of it: which competition, which week, and whose ground it
 * is on.
 */
export function MatchupCard({ identity, ratings, record, week, competition, clubOf }: {
  readonly identity: DashboardOut['identity'];
  readonly ratings: DashboardOut['ratings'];
  readonly record: DashboardOut['record'];
  readonly week: DashboardOut['thisWeek'];
  /** "Regular Season · Week 1", or the round when the bracket is on. */
  readonly competition: string;
  readonly clubOf: (teamId: string) => { primary: string; secondary: string } | undefined;
}) {
  const away = week.home === false;
  const opponent = clubOf(week.opponentId ?? '');
  return (
    <section
      data-testid="matchup"
      style={{
        position: 'relative', borderRadius: R.lg, overflow: 'hidden',
        border: `1px solid ${COLOR.line}`, background: COLOR.panel, boxShadow: ELEV.mid,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          height: 3,
          background: `linear-gradient(90deg, ${identity.primary} 0%, ${identity.secondary} 100%)`,
        }}
      />
      <div style={{ padding: S[4], minWidth: 0 }}>
        <Side
          abbreviation={identity.teamId}
          name={identity.fullName}
          record={recordOf(record)}
          primary={identity.primary === '' ? COLOR.line2 : identity.primary}
          secondary={identity.secondary === '' ? COLOR.mut : identity.secondary}
          offense={ratings.offense}
          defense={ratings.defense}
          overall={ratings.overall}
          band={ratings.overallBand}
        />

        {/* The middle bar. "at" and "vs" are the whole point of it: everything
            else on the card is true wherever the game is played. */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: S[3],
            margin: `${String(S[3])}px 0`, minWidth: 0,
          }}
        >
          <div aria-hidden="true" style={{ flex: 1, height: 1, background: COLOR.line }} />
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ ...TYPE.micro, fontSize: 9.5, color: COLOR.dim }}>{competition}</div>
            <div
              data-testid="matchup-location"
              style={{
                fontFamily: FONT.display, fontSize: 13, fontWeight: 700, marginTop: 2,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: away ? COLOR.mut : COLOR.amber,
              }}
            >
              {week.opponentId === null ? 'No game' : away ? 'Away' : 'Home'}
            </div>
          </div>
          <div aria-hidden="true" style={{ flex: 1, height: 1, background: COLOR.line }} />
        </div>

        <Side
          abbreviation={week.opponentId ?? '—'}
          name={`${away ? 'at ' : 'vs '}${week.opponentName ?? 'Nobody'}`}
          record={recordOf(week.opponentRecord)}
          primary={opponent?.primary ?? COLOR.line2}
          secondary={opponent?.secondary ?? COLOR.mut}
          offense={week.opponentOffense}
          defense={week.opponentDefense}
          overall={week.opponentOverall}
          band={week.opponentBand}
        />

        {week.difficulty !== null && (
          <div style={{ marginTop: S[3] }}>
            <Pill
              label={`${week.difficulty} matchup`}
              colour={difficultyColour(week.difficulty)}
              testId="matchup-difficulty"
            />
          </div>
        )}
      </div>
    </section>
  );
}

/** How a prep card reads: a fact, a problem, or a thing that does not exist. */
export type PrepTone = 'ready' | 'warn' | 'plain' | 'absent';

const PREP_COLOR: Readonly<Record<PrepTone, string>> = {
  ready: COLOR.teal,
  warn: COLOR.amber,
  plain: COLOR.tx,
  absent: COLOR.dim,
};

/**
 * One thing worth knowing before kick-off.
 *
 * An `absent` card is dashed and dimmed like the NotBuilt cards elsewhere,
 * because it is the same promise: this is a thing the game will do and does
 * not do yet. A "Balanced" gameplan drawn like the other four would be a
 * setting nobody chose, dressed as one somebody did.
 */
export function PrepCard({ label, value, detail, tone }: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: PrepTone;
}) {
  const absent = tone === 'absent';
  return (
    <div
      data-testid={`prep-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
      data-tone={tone}
      style={{
        padding: `${String(S[3])}px ${String(S[3])}px`,
        borderRadius: R.md, minWidth: 0,
        background: absent ? 'rgba(0,0,0,0.14)' : COLOR.panel,
        border: absent ? `1px dashed ${COLOR.line2}` : `1px solid ${COLOR.line}`,
        boxShadow: absent ? 'none' : ELEV.low,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: S[2], minWidth: 0 }}>
        <span style={{ ...TYPE.micro, fontSize: 9.5, color: COLOR.dim, flex: 1, minWidth: 0 }}>
          {label}
        </span>
        {absent && (
          <span
            style={{
              ...TYPE.micro, fontSize: 8.5, color: COLOR.dim, whiteSpace: 'nowrap',
              border: `1px solid ${tint(COLOR.line2, 0.8)}`, borderRadius: R.pill,
              padding: '1px 6px',
            }}
          >
            Not built yet
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: FONT.display, fontSize: 16, fontWeight: 600, marginTop: 3,
          color: PREP_COLOR[tone],
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
      <div style={{ ...TYPE.prose, fontSize: 11, color: COLOR.dim, marginTop: 2 }}>
        {detail}
      </div>
    </div>
  );
}

/**
 * The prep cards, two across on a phone.
 *
 * Five cards in two columns leaves a hole in the last row, which reads as a
 * card that failed to load rather than as a card that is not there. The last
 * one is given the whole row instead.
 */
export function PrepGrid({ children }: { readonly children: ReactNode }) {
  return (
    <div
      data-testid="game-prep"
      style={{
        display: 'grid', gap: S[2], minWidth: 0,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}
    >
      {children}
    </div>
  );
}

/** The card that finishes an odd row, spanning what is left of it. */
export function PrepWide({ children }: { readonly children: ReactNode }) {
  return <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>{children}</div>;
}
