// The two moments either side of simulating a week.
//
// Before: a confirmation, but only when there is something real to confirm.
// A dialog that appeared every week would be a dialog nobody reads by
// October, so it is raised for facts that cost a Sunday -- a position group
// with nobody first in line, or a man at the top of one who is hurt -- and for
// nothing else.
//
// After: the result. The point of the modal is not the score, which the screen
// behind it already shows; it is that the save moved. The record, the points
// and the week all changed, and a manager who taps a button that alters a
// decade of dynasty should see what it altered.

import { COLOR, FONT, R, S, TYPE } from '../app/tokens';
import { Modal } from '../components/Modal';
import { ActionButton } from '../components/ActionButton';
import { StatTiles } from '../components/StatTiles';
import { signed } from './dashboardCards';
import type { DashboardOut } from '../../supabase/functions/_shared/api/reads/dashboard';

/** A reason to stop and think, in the words the modal lists it in. */
export interface Warning {
  readonly key: string;
  readonly text: string;
}

/**
 * What is wrong with taking the field right now.
 *
 * Both are facts the save holds, not opinions about the roster: a group with
 * nobody named first, and starters who are unavailable. A warning nobody can
 * act on is noise, and both of these are one tap from being fixed.
 */
export function warningsFor(d: DashboardOut): readonly Warning[] {
  const out: Warning[] = [];
  const missing = d.shape.positionGroups - d.shape.depthStarters;
  if (missing > 0) {
    out.push({
      key: 'depth',
      text: `${String(missing)} position ${missing === 1 ? 'group has' : 'groups have'} nobody `
        + 'named first. The simulation will pick somebody for you.',
    });
  }
  if (d.injuredStarters > 0) {
    out.push({
      key: 'injured',
      text: `${String(d.injuredStarters)} ${d.injuredStarters === 1 ? 'starter is' : 'starters are'} `
        + 'out this week. Their backups play unless you reorder the chart.',
    });
  }
  return out;
}

export function SimWarningModal({ warnings, week, onCancel, onConfirm }: {
  readonly warnings: readonly Warning[];
  readonly week: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Modal
      title="Play it like this?"
      detail="The week will be simulated with the roster as it stands."
      onClose={onCancel}
      testId="sim-warning"
      actions={(
        <>
          <ActionButton tone="quiet" onClick={onCancel} testId="sim-cancel" compact>
            Cancel
          </ActionButton>
          <ActionButton onClick={onConfirm} testId="sim-anyway" compact>
            Sim anyway
          </ActionButton>
        </>
      )}
    >
      <ul
        data-testid="sim-warnings"
        style={{ ...TYPE.prose, margin: 0, paddingLeft: S[5], color: COLOR.mut, display: 'grid', gap: S[2] }}
      >
        {warnings.map((w) => <li key={w.key}>{w.text}</li>)}
      </ul>
      <p style={{ ...TYPE.prose, margin: `${String(S[3])}px 0 0`, color: COLOR.dim, fontSize: 12 }}>
        Week {String(week)} cannot be un-played. The save moves on either way.
      </p>
    </Modal>
  );
}

/**
 * What kind of result it was, in two or three words.
 *
 * Read off the margin and off what the two clubs were rated: beating a better
 * side is an upset whatever the margin, and that is the one thing a bare score
 * does not say. Every branch is a fact about numbers the save holds.
 */
export function resultLabel(
  teamScore: number, opponentScore: number,
  mine: number | null, theirs: number | null,
): string {
  const margin = teamScore - opponentScore;
  if (margin === 0) return 'Tied';
  const underdog = mine !== null && theirs !== null && theirs - mine >= 3;
  const favourite = mine !== null && theirs !== null && mine - theirs >= 3;
  if (margin > 0) {
    if (underdog) return 'Upset win';
    if (margin >= 17) return 'Comfortable win';
    return margin <= 3 ? 'Won it late' : 'Win';
  }
  if (favourite) return 'Upset defeat';
  if (margin <= -17) return 'Heavy defeat';
  return margin >= -3 ? 'Lost a close one' : 'Defeat';
}

/** Teal for a win, red for a defeat, plain for a tie. */
const labelColour = (teamScore: number, opponentScore: number): string =>
  (teamScore === opponentScore ? COLOR.tx : teamScore > opponentScore ? COLOR.teal : COLOR.red);

export function ResultModal({ result, record, mine, theirs, opponentName, onRecap, onResults, onClose }: {
  readonly result: NonNullable<DashboardOut['last']>;
  readonly record: DashboardOut['record'];
  readonly mine: number | null;
  readonly theirs: number | null;
  readonly opponentName: string;
  readonly onRecap: () => void;
  readonly onResults: () => void;
  readonly onClose: () => void;
}) {
  const label = resultLabel(result.teamScore, result.opponentScore, mine, theirs);
  const colour = labelColour(result.teamScore, result.opponentScore);
  return (
    <Modal
      title={result.round ?? `Week ${String(result.week)}`}
      detail={`${result.home ? 'vs' : 'at'} ${opponentName}`}
      onClose={onClose}
      testId="sim-result"
      actions={(
        <>
          <ActionButton tone="quiet" onClick={onRecap} testId="result-recap" compact>
            Recap
          </ActionButton>
          <ActionButton tone="quiet" onClick={onResults} testId="result-league" compact>
            League results
          </ActionButton>
          <ActionButton onClick={onClose} testId="result-continue" compact>
            Next week
          </ActionButton>
        </>
      )}
    >
      <div style={{ textAlign: 'center', minWidth: 0 }}>
        <div
          className="numeric"
          data-testid="result-score"
          style={{
            fontFamily: FONT.display, fontSize: 40, fontWeight: 700, lineHeight: 1,
            color: colour, letterSpacing: '0.02em',
          }}
        >
          {String(result.teamScore)} &ndash; {String(result.opponentScore)}
        </div>
        <div
          data-testid="result-label"
          style={{
            ...TYPE.micro, fontSize: 10, color: colour, marginTop: S[2],
            border: `1px solid ${colour}`, borderRadius: R.pill,
            padding: '3px 10px', display: 'inline-block',
          }}
        >
          {label}
        </div>
      </div>

      {/* What the week did to the save. The score is the story; these three
          are the reason the button was worth pressing. */}
      <div style={{ marginTop: S[4] }}>
        <StatTiles
          stats={[
            {
              label: 'Record',
              value: record === null
                ? '—'
                : `${String(record.wins)}-${String(record.losses)}${record.ties > 0 ? `-${String(record.ties)}` : ''}`,
            },
            { label: 'Points for', value: record === null ? '—' : String(record.pointsFor) },
            { label: 'Against', value: record === null ? '—' : String(record.pointsAgainst) },
          ]}
        />
      </div>
    </Modal>
  );
}

/**
 * The confirmation in front of the season sim.
 *
 * It is not a formality. Running the season out plays every remaining week in
 * one press, and everything a manager would have done in between -- the depth
 * chart after an injury, a trade, a gameplan -- is decided by the simulation
 * instead of by them. The modal says exactly that, and counts the weeks it is
 * about to take, because "are you sure" without a number is a question nobody
 * can answer.
 */
export function SeasonWarningModal({ weeks, record, onCancel, onConfirm }: {
  readonly weeks: number;
  readonly record: DashboardOut['record'];
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Modal
      title="Sim to End of Regular Season?"
      onClose={onCancel}
      testId="season-warning"
      actions={(
        <>
          <ActionButton tone="quiet" onClick={onCancel} testId="season-cancel" compact>
            Cancel
          </ActionButton>
          <ActionButton onClick={onConfirm} testId="season-confirm" compact>
            Sim Season
          </ActionButton>
        </>
      )}
    >
      <p style={{ ...TYPE.prose, margin: 0, color: COLOR.mut }}>
        This will simulate all remaining regular season weeks and may skip weekly
        decisions, depth chart review, injuries, trades, and gameplan changes.
      </p>
      <div style={{ marginTop: S[4] }}>
        <StatTiles
          stats={[
            { label: 'Weeks', value: String(weeks), tone: 'accent' },
            {
              label: 'Record',
              value: record === null
                ? '—'
                : `${String(record.wins)}-${String(record.losses)}${record.ties > 0 ? `-${String(record.ties)}` : ''}`,
            },
            // One word: three tiles across a 320px dialog give each about
            // eighty pixels, and "Point diff" clipped to "POINT ...".
            { label: 'Diff', value: record === null ? '—' : signed(record.differential) },
          ]}
        />
      </div>
    </Modal>
  );
}

/** A named game, one line. Null where the season has none of that kind yet. */
function MarginLine({ label, margin, nameOf }: {
  readonly label: string;
  readonly margin: DashboardOut['bestWin'];
  readonly nameOf: (teamId: string) => string;
}) {
  return (
    <div style={{ display: 'flex', gap: S[3], alignItems: 'baseline', minWidth: 0 }}>
      <span style={{ ...TYPE.micro, fontSize: 10, color: COLOR.dim, width: 74, flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          ...TYPE.prose, fontSize: 12, color: margin === null ? COLOR.dim : COLOR.tx,
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {margin === null
          ? 'None this season'
          : `${String(margin.teamScore)}–${String(margin.opponentScore)} `
            + `${margin.margin > 0 ? 'over' : 'to'} ${nameOf(margin.opponentId)}, week ${String(margin.week)}`}
      </span>
    </div>
  );
}

/**
 * Where the regular season left the club.
 *
 * Shown once, when the last week has been played, and deliberately not a door
 * into the bracket: the postseason is its own decision and this screen does
 * not make it for anybody. It says what happened and what is next, and the
 * manager chooses when.
 */
export function SeasonSummaryModal({ season, record, seed, bestWin, worstLoss, nameOf, onBracket, onClose }: {
  readonly season: number;
  readonly record: DashboardOut['record'];
  /** The club's place in the bracket, or null where it missed the field. */
  readonly seed: number | null;
  readonly bestWin: DashboardOut['bestWin'];
  readonly worstLoss: DashboardOut['worstLoss'];
  readonly nameOf: (teamId: string) => string;
  readonly onBracket: () => void;
  readonly onClose: () => void;
}) {
  const made = seed !== null;
  return (
    <Modal
      title={`${String(season)} regular season`}
      detail="Every remaining week has been played."
      onClose={onClose}
      testId="season-summary"
      actions={(
        <>
          <ActionButton tone="quiet" onClick={onClose} testId="summary-close" compact>
            Stay here
          </ActionButton>
          <ActionButton onClick={onBracket} testId="summary-bracket" compact>
            See the bracket
          </ActionButton>
        </>
      )}
    >
      <StatTiles
        stats={[
          {
            label: 'Record',
            value: record === null
              ? '—'
              : `${String(record.wins)}-${String(record.losses)}${record.ties > 0 ? `-${String(record.ties)}` : ''}`,
          },
          { label: 'Points for', value: record === null ? '—' : String(record.pointsFor) },
          { label: 'Against', value: record === null ? '—' : String(record.pointsAgainst) },
        ]}
      />
      <div style={{ marginTop: S[3] }}>
        <StatTiles
          stats={[
            {
              label: 'Point diff',
              value: record === null ? '—' : signed(record.differential),
              tone: record === null || record.differential === 0
                ? 'default' : record.differential > 0 ? 'positive' : 'negative',
            },
            {
              label: 'Postseason',
              value: made ? `Seed ${String(seed)}` : 'Missed out',
              tone: made ? 'positive' : 'default',
            },
          ]}
        />
      </div>

      <div style={{ display: 'grid', gap: S[2], marginTop: S[4], minWidth: 0 }} data-testid="season-margins">
        <MarginLine label="Best win" margin={bestWin} nameOf={nameOf} />
        <MarginLine label="Worst loss" margin={worstLoss} nameOf={nameOf} />
      </div>

      <p style={{ ...TYPE.prose, margin: `${String(S[4])}px 0 0`, color: COLOR.dim, fontSize: 12 }}>
        {made
          ? 'The bracket is drawn and waiting. Nothing has been played in it: the '
            + 'postseason is yours to start when you are ready.'
          : 'Your season is over. The bracket is played out by the rest of the league, '
            + 'and the offseason opens when it finishes.'}
      </p>
    </Modal>
  );
}
