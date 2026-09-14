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
      <p style={{ ...TYPE.prose, margin: `${String(S[3])}px 0 0`, color: COLOR.dim, fontSize: 11.5 }}>
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
