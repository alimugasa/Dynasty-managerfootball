// The cards on the franchise dashboard.
//
// Split out of TeamScreen so neither file is mostly the other: the screen
// decides what is on the page and in what order, and this decides what each
// card looks like. Everything here is handed its numbers; nothing reads.
//
// One rule runs through all of it. A number the save does not hold is drawn as
// a dash and labelled as unmeasured, never as a zero -- a club with no cap
// sheet and a club with no cap space are opposite facts, and a season with no
// games played is not a season of nought-all draws.

import type { ReactNode } from 'react';
import { COLOR, ELEV, FONT, R, S, TYPE, tint } from '../app/tokens';
import { Caption } from '../components/Surface';
import { ChevronRightIcon } from '../components/icons';
import { bandColor } from './ratingRing';
import type { RatingBand } from '../../supabase/functions/_shared/api/reads/teamOutlook';

const money = (n: number): string => `${n < 0 ? '-' : ''}${(Math.abs(n) / 1e6).toFixed(1)}M`;
export const signed = (n: number): string => (n > 0 ? `+${String(n)}` : String(n));
export const capLabel = (n: number | null): string => (n === null ? '—' : money(n));

/** A card with a heading of its own, for the ones that are not a list. */
export function DashCard({ title, trailing, children, testId }: {
  readonly title: string;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
  readonly testId: string;
}) {
  return (
    <section
      data-testid={testId}
      style={{
        background: COLOR.panel, border: `1px solid ${COLOR.line}`,
        borderRadius: R.md, boxShadow: ELEV.low,
        padding: S[4], minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: S[2], minWidth: 0 }}>
        <h2 style={{ ...TYPE.micro, margin: 0, color: COLOR.mut, flex: 1, minWidth: 0 }}>
          {title}
        </h2>
        {trailing !== undefined && <span style={{ flexShrink: 0 }}>{trailing}</span>}
      </div>
      <div style={{ marginTop: S[3], minWidth: 0 }}>{children}</div>
    </section>
  );
}

/** A word in a coloured pill: a matchup's difficulty, an owner's mood. */
export function Pill({ label, colour, testId }: {
  readonly label: string;
  readonly colour: string;
  readonly testId?: string;
}) {
  return (
    <span
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      style={{
        ...TYPE.micro, fontSize: 9.5, color: colour, whiteSpace: 'nowrap',
        background: tint(colour, 0.12), border: `1px solid ${tint(colour, 0.42)}`,
        borderRadius: R.pill, padding: '3px 9px',
      }}
    >
      {label}
    </span>
  );
}

/** How hard next week looks, in the colour it deserves. Even is not a warning,
 *  so it is not amber; only the two that should worry a manager are. */
const DIFFICULTY_COLOR: Readonly<Record<string, string>> = {
  Comfortable: COLOR.teal,
  Favoured: COLOR.teal,
  Even: COLOR.mut,
  Tough: COLOR.amber,
  Severe: COLOR.red,
};

export const difficultyColour = (label: string | null): string =>
  (label === null ? COLOR.dim : DIFFICULTY_COLOR[label] ?? COLOR.mut);

/**
 * The season's numbers.
 *
 * Five figures, and the two that can be missing say so: a league position
 * nobody has earned yet, and a turnover column on a season whose box scores
 * recorded none. The rest are counted from games that were played, so before
 * kick-off they are honestly nought, drawn muted because nought points for is
 * a fact about a season that has not started rather than about a bad team.
 */
export function PerformanceTiles({ pointsFor, pointsAgainst, differential, turnovers, rank, teams, played }: {
  readonly pointsFor: number | null;
  readonly pointsAgainst: number | null;
  readonly differential: number | null;
  readonly turnovers: number | null;
  readonly rank: number | null;
  readonly teams: number;
  readonly played: number;
}) {
  const quiet = played === 0;
  const cells: readonly {
    label: string; value: string; tone: string; testId: string;
  }[] = [
    {
      label: 'Points for', value: pointsFor === null ? '—' : String(pointsFor),
      tone: COLOR.tx, testId: 'tile-pf',
    },
    {
      label: 'Against', value: pointsAgainst === null ? '—' : String(pointsAgainst),
      tone: COLOR.tx, testId: 'tile-pa',
    },
    {
      label: 'Point diff',
      value: differential === null ? '—' : signed(differential),
      tone: differential === null || differential === 0 || quiet
        ? COLOR.tx : differential > 0 ? COLOR.teal : COLOR.red,
      testId: 'tile-diff',
    },
    {
      label: 'Turnovers',
      value: turnovers === null ? '—' : signed(turnovers),
      tone: turnovers === null || turnovers === 0
        ? COLOR.tx : turnovers > 0 ? COLOR.teal : COLOR.red,
      testId: 'tile-turnovers',
    },
    {
      label: 'League rank',
      value: rank === null ? '—' : `${String(rank)}/${String(teams)}`,
      tone: COLOR.tx, testId: 'tile-rank',
    },
  ];

  // Five tiles in two rows that both fill: three scoring figures, then the two
  // that are about the season rather than the scoreboard. Five equal columns
  // would squeeze "League rank" until it wrapped mid-word, and five in a
  // three-wide grid would leave a hole in the second row that reads as a tile
  // that failed to load.
  const span = (i: number): number => (i < 3 ? 2 : 3);

  return (
    <div
      data-testid="performance-tiles"
      style={{
        display: 'grid', gap: 6, minWidth: 0,
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
      }}
    >
      {cells.map((c, i) => (
        <div
          key={c.label}
          data-testid={c.testId}
          style={{
            gridColumn: `span ${String(span(i))}`,
            background: COLOR.panel, border: `1px solid ${COLOR.line}`,
            borderRadius: R.sm, padding: `${String(S[2])}px ${String(S[3])}px`,
            minWidth: 0, boxShadow: ELEV.low,
          }}
        >
          <div
            className="numeric"
            style={{
              fontFamily: FONT.display, fontSize: 20, fontWeight: 600, lineHeight: 1.1,
              // Before a game is played every one of these is a nought that
              // means "not yet". Dimming them says so without a second line.
              color: quiet ? COLOR.dim : c.tone,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {c.value}
          </div>
          <div
            style={{
              ...TYPE.micro, fontSize: 9.5, marginTop: 2,
              color: quiet ? COLOR.dim : COLOR.mut,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The owner's meter. A stored number, drawn as the share of the bar it is. */
export function PatienceMeter({ patience, mood }: {
  readonly patience: number | null;
  readonly mood: string | null;
}) {
  if (patience === null) {
    return (
      <Caption>Patience is not recorded for this club&rsquo;s owner.</Caption>
    );
  }
  const share = Math.max(0, Math.min(100, patience)) / 100;
  // Low patience is the one that should catch an eye; a patient owner is not
  // good news to be celebrated in teal, it is simply less pressure.
  const colour = patience >= 60 ? COLOR.teal : patience >= 35 ? COLOR.amber : COLOR.red;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: S[2], minWidth: 0 }}>
        <span style={{ ...TYPE.micro, fontSize: 10, color: COLOR.dim, flex: 1 }}>Patience</span>
        <span style={{ ...TYPE.micro, fontSize: 10, color: COLOR.mut }}>
          {mood ?? `${String(patience)} of 100`}
        </span>
      </div>
      <div
        data-testid="patience-meter"
        aria-hidden="true"
        style={{
          height: 4, borderRadius: R.pill, background: COLOR.line,
          marginTop: 5, overflow: 'hidden',
        }}
      >
        <div style={{ width: `${String(share * 100)}%`, height: '100%', background: colour }} />
      </div>
    </div>
  );
}

/** One row of the before-kick-off checklist. */
export type CheckState = 'ready' | 'attention' | 'open';

const CHECK_MARK: Readonly<Record<CheckState, { glyph: string; colour: string }>> = {
  ready: { glyph: '✓', colour: COLOR.teal },
  attention: { glyph: '!', colour: COLOR.amber },
  open: { glyph: '·', colour: COLOR.dim },
};

export function CheckRow({ title, detail, state, onSelect, testId }: {
  readonly title: string;
  readonly detail: string;
  readonly state: CheckState;
  readonly onSelect: () => void;
  readonly testId: string;
}) {
  const mark = CHECK_MARK[state];
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testId}
      style={{
        display: 'flex', alignItems: 'center', gap: S[3], width: '100%',
        minWidth: 0, boxSizing: 'border-box', textAlign: 'left',
        padding: `${String(S[3])}px 0`, background: 'none', border: 0,
        borderBottom: `1px solid ${COLOR.line}`, cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 22, height: 22, flexShrink: 0, borderRadius: R.pill,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: tint(mark.colour, 0.12),
          border: `1px solid ${tint(mark.colour, 0.4)}`,
          color: mark.colour, fontSize: 12, lineHeight: 1, fontWeight: 700,
        }}
      >
        {mark.glyph}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...TYPE.body, display: 'block', color: COLOR.tx }}>{title}</span>
        <span style={{ ...TYPE.prose, display: 'block', color: COLOR.mut, fontSize: 11.5 }}>
          {detail}
        </span>
      </span>
      <span style={{ color: COLOR.dim, display: 'flex', flexShrink: 0 }}>
        <ChevronRightIcon />
      </span>
    </button>
  );
}

/** What a rating tile's band is called, for the line under the rings. */
export function BandLegend({ band, label }: {
  readonly band: RatingBand | null;
  readonly label: string;
}) {
  return (
    <span style={{ ...TYPE.micro, fontSize: 9.5, color: bandColor(band) }}>{label}</span>
  );
}

/** The gold button, and the two quiet ones beside it. */
export function WeekActions({ primary, secondary }: {
  readonly primary: ReactNode;
  readonly secondary: ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: S[2], marginTop: S[4], minWidth: 0 }}>
      {primary}
      <div style={{ display: 'grid', gap: S[2], gridTemplateColumns: '1fr 1fr', minWidth: 0 }}>
        {secondary}
      </div>
    </div>
  );
}
