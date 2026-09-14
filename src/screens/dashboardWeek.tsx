// This week, the owner, and the sheet a checklist row raises when the screen
// it points at does not exist.
//
// Two cards that each answer one question a manager asks on opening the app:
// who do we play, and what was I hired to do. The checklist itself is next
// door in checklistCard.tsx, which is where its three states live.
//
// The week card has four faces rather than one with holes in it, because "you
// are on a bye", "the season is over" and "this save has no fixture list" are
// three different facts and only the last is a fault. Drawing a bye where the
// schedule is missing would hide a broken world behind a rest week.

import type { ReactNode } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { EmptyState } from '../components/Surface';
import { ActionButton } from '../components/ActionButton';
import { Sheet } from '../components/Sheet';
import { bandColor } from './ratingRing';
import {
  DashCard, PatienceMeter, Pill, WeekActions, difficultyColour,
} from './dashboardCards';
import { mandateCopy } from './dashboardMandate';
import type { SheetCopy } from './checklistCatalogue';
import type { DashboardOut } from '../../supabase/functions/_shared/api/reads/dashboard';

const recordOf = (r: { wins: number; losses: number; ties: number } | null): string =>
  (r === null ? '—' : `${String(r.wins)}-${String(r.losses)}${r.ties > 0 ? `-${String(r.ties)}` : ''}`);

export function ThisWeekCard({ week, weeks, busy, onSim, onPreview, onDepthChart, onRecheck }: {
  readonly week: DashboardOut['thisWeek'];
  readonly weeks: number;
  readonly busy: string | null;
  readonly onSim: () => void;
  readonly onPreview: () => void;
  readonly onDepthChart: () => void;
  readonly onRecheck: () => void;
}) {
  const label = week.round ?? `Week ${String(week.week)} of ${String(weeks)}`;

  if (week.state === 'NO_SCHEDULE') {
    return (
      <DashCard title="This week" testId="this-week">
        <EmptyState
          title="Schedule not generated"
          detail="This save has no fixtures for the season. The world was built without a
            schedule, or it was removed; nothing can be played until it is there."
        />
        <p style={{ ...TYPE.prose, margin: `${String(S[3])}px 0 0`, color: COLOR.dim, fontSize: 11.5 }}>
          There is no repair for this in the game yet, and a button that claimed to fix
          it would not. Check again in case the build was still finishing; if it stays
          empty, the save was not created successfully and starting a new franchise is
          the honest way out.
        </p>
        <div style={{ marginTop: S[3] }}>
          <ActionButton tone="quiet" onClick={onRecheck} testId="week-recheck">
            Check again
          </ActionButton>
        </div>
      </DashCard>
    );
  }

  if (week.state !== 'FIXTURE') {
    return (
      <DashCard title="This week" testId="this-week">
        <EmptyState
          title={week.state === 'SEASON_OVER' ? 'The season is over' : 'Bye week'}
          detail={week.state === 'SEASON_OVER'
            ? 'Nothing left to play this year. The offseason is on the Play tab.'
            : 'No game this week. The league plays on without you; advance the week to join it.'}
        />
        <div style={{ marginTop: S[3] }}>
          <ActionButton onClick={onSim} disabled={busy !== null} testId="dash-sim-week">
            {busy ?? (week.state === 'SEASON_OVER' ? 'Go to Play' : `Advance week ${String(week.week)}`)}
          </ActionButton>
        </div>
      </DashCard>
    );
  }

  return (
    <DashCard
      title={label}
      testId="this-week"
      trailing={week.difficulty === null
        ? undefined
        : <Pill label={week.difficulty} colour={difficultyColour(week.difficulty)} testId="matchup-difficulty" />}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: S[3], minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...TYPE.micro, fontSize: 10, color: COLOR.dim }}>
            {week.home === true ? 'Home' : 'Away'}
          </div>
          <div
            style={{
              ...TYPE.heading, fontSize: 17, color: COLOR.tx, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            data-testid="week-opponent"
          >
            {week.home === true ? 'vs ' : 'at '}{week.opponentName ?? week.opponentId ?? 'Opponent'}
          </div>
          <div style={{ ...TYPE.prose, color: COLOR.mut, fontSize: 11.5, marginTop: 2 }}>
            {recordOf(week.opponentRecord)} this season
            {week.opponentOverall === null ? '' : ' · rated '}
            {week.opponentOverall !== null && (
              <span style={{ color: bandColor(week.opponentBand) }}>
                {String(week.opponentOverall)}
              </span>
            )}
          </div>
        </div>
      </div>

      <WeekActions
        primary={(
          <ActionButton onClick={onSim} disabled={busy !== null} testId="dash-sim-week">
            {busy ?? `Sim week ${String(week.week)}`}
          </ActionButton>
        )}
        secondary={(
          <>
            <ActionButton tone="quiet" onClick={onPreview} testId="week-preview">
              Game preview
            </ActionButton>
            <ActionButton tone="quiet" onClick={onDepthChart} testId="week-depth">
              Depth chart
            </ActionButton>
          </>
        )}
      />
    </DashCard>
  );
}

export function OwnerCard({ owner }: { readonly owner: DashboardOut['owner'] }) {
  if (owner === null) {
    return (
      <DashCard title="The owner" testId="owner-card">
        <EmptyState
          title="No owner on file"
          detail="This world shipped without an owner for the club, so there is no mandate
            to report."
        />
      </DashCard>
    );
  }
  const copy = mandateCopy(owner.mandate);
  return (
    <DashCard
      title="The owner"
      testId="owner-card"
      trailing={owner.standing === null
        ? undefined
        : <Pill label={owner.standing} colour={COLOR.mut} testId="mandate-standing" />}
    >
      <div style={{ ...TYPE.micro, fontSize: 10, color: COLOR.dim }}>
        {owner.name}
        {owner.archetype === null ? '' : ` · ${owner.archetype}`}
        {owner.tenureYears === null ? '' : ` · ${String(owner.tenureYears)} years`}
      </div>
      <div
        data-testid="owner-goal"
        style={{ ...TYPE.heading, fontSize: 17, color: COLOR.amber, marginTop: 4 }}
      >
        {copy?.label ?? 'No mandate'}
      </div>
      <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0 0`, color: COLOR.mut, fontSize: 12 }}>
        {copy?.detail
          ?? 'The roster could not be rated, so nothing can be said about what is expected of it.'}
      </p>
      <div style={{ marginTop: S[3] }}>
        <PatienceMeter patience={owner.patience} mood={owner.mood} />
      </div>
      {/* The one line that keeps the card honest. Patience and the mandate are
          read off the save and shown; nothing in the simulation reads them
          back, and a manager should not spend four seasons managing to a
          number that was never watching. */}
      <p style={{ ...TYPE.prose, margin: `${String(S[3])}px 0 0`, color: COLOR.dim, fontSize: 11 }}>
        The owner does not act on this yet. Nobody is fired, and the mandate changes
        nothing the simulation does.
      </p>
    </DashCard>
  );
}

/**
 * A checklist destination that has not been built.
 *
 * A row that pointed at a screen rendering nothing, or that quietly did
 * nothing at all, are the two dishonest answers. This is the third: it says
 * what will live there in the words that screen will use, and what the game
 * can truthfully tell you today.
 *
 * `facts` is what is real right now -- the cap sheet on the cap item -- shown
 * above the description, so the sheet is worth opening rather than only worth
 * reading once.
 */
export function ChecklistSheet({ copy, facts, onAction, onClose }: {
  readonly copy: SheetCopy;
  readonly facts?: ReactNode;
  /** The one thing that can be done about it today, where there is one. */
  readonly onAction?: () => void;
  readonly onClose: () => void;
}) {
  return (
    <Sheet
      title={copy.title}
      detail={copy.detail}
      badge="Not built yet"
      onClose={onClose}
      testId="checklist-sheet"
    >
      {facts !== undefined && <div style={{ marginBottom: S[4] }}>{facts}</div>}
      <div style={{ display: 'grid', gap: S[3], minWidth: 0 }}>
        {copy.body.map((line, i) => (
          <p key={i} style={{ ...TYPE.prose, margin: 0, color: COLOR.mut, fontSize: 12.5 }}>
            {line}
          </p>
        ))}
      </div>
      <div style={{ display: 'grid', gap: S[2], marginTop: S[4] }}>
        {copy.action !== undefined && onAction !== undefined && (
          <ActionButton onClick={onAction} testId="sheet-action">{copy.action}</ActionButton>
        )}
        <ActionButton tone="quiet" onClick={onClose} testId="sheet-close">
          Close
        </ActionButton>
      </div>
    </Sheet>
  );
}
