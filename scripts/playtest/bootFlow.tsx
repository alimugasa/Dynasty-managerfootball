// Choosing a franchise, in the play-test build: the board, the scouting report
// and the review, which are three views of one decision.
//
// Split out of App.tsx because they belong together and because App.tsx is a
// router with a game in it -- the three of them carry their own state (which
// club is being looked at, what the board is filtered to) and none of it
// concerns the rest of the rig.
//
// Every screen here is the product's own component, handed the profiles this
// build measured from the packed seed rather than the ones the server measured
// from Postgres. Same components, same labels, same flow.

import { useState } from 'react';
import { COLOR, S, TYPE } from '../../src/app/tokens';
import { ActionButton } from '../../src/components/ActionButton';
import { Modal } from '../../src/components/Modal';
import { SetupBar } from '../../src/components/SetupBar';
import { FranchiseSettingsBody } from '../../src/screens/franchiseSettings';
import { FranchiseSummary } from '../../src/screens/franchiseSummary';
import { gmStyleLabel } from '../../src/screens/gmStyles';
import { TeamPreview } from '../../src/screens/teamPreview';
import { SelectTeamScreen, type GmDraft } from './boot';
import { RigWorldBuild } from './worldGen';
import { PRESETS, difficultyOf } from '../../supabase/functions/_shared/api/franchiseOptions';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';
import { BOARD_SEASON, boardLeague } from './board';

/** The three routes this module renders. Named here because this is what
 *  renders them; App.tsx folds them into its own Route union.
 *
 *  'franchiseSettings' rather than 'settings': the main menu already has a
 *  Settings panel on that name, and calling the review the same thing hid it
 *  behind the menu -- a bug only a walk through the flow finds. */
export type BootRoute =
  | 'pick' | 'preview' | 'franchiseSettings' | 'confirmFranchise' | 'worldGen';

export function FranchiseFlow({
  route, board, busy, pending, filter, query,
  onFilter, onQuery, onPending, onRoute, onStart, onMenu,
}: {
  readonly route: string;
  readonly board: readonly TeamProfile[];
  readonly busy: string | null;
  readonly pending: GmDraft | null;
  readonly filter: string;
  readonly query: string;
  readonly onFilter: (next: string) => void;
  readonly onQuery: (next: string) => void;
  readonly onPending: (next: GmDraft | null) => void;
  readonly onRoute: (next: BootRoute) => void;
  /** Builds the league and opens the dynasty. The only thing here that writes. */
  readonly onStart: (teamId: string) => void;
  /** Back to the front door, from the world screen's failure card. */
  readonly onMenu: () => void;
}) {
  // The club being looked at, held on the draft the way the app holds it, so
  // walking back to the board and forward again does not lose the pick.
  const previewing = board.find((t) => t.teamId === pending?.teamId);
  // Open only while the player is being asked whether they meant it.
  const [asking, setAsking] = useState(false);

  return (
    <>
      {route === 'pick' && (
        <SelectTeamScreen
          teams={board}
          busy={busy}
          filter={filter}
          query={query}
          onFilter={onFilter}
          onQuery={onQuery}
          onPick={(teamId) => {
            if (pending !== null) onPending({ ...pending, teamId });
            onRoute('preview');
          }}
        />
      )}

      {route === 'preview' && previewing !== undefined && (
        <TeamPreview
          team={previewing}
          busy={busy}
          onBack={() => { onRoute('pick'); }}
          onConfirm={() => { onRoute('franchiseSettings'); }}
        />
      )}

      {route === 'franchiseSettings' && pending !== null && (
        <>
          <FranchiseSettingsBody
            gmName={`${pending.first.trim()} ${pending.last.trim()}`.trim()}
            team={previewing ?? null}
            season={BOARD_SEASON}
            settings={pending.settings}
            difficulty={pending.difficulty}
            onDifficulty={(next) => {
              onPending(next === 'CUSTOM'
                ? { ...pending, difficulty: next }
                : { ...pending, difficulty: next, settings: PRESETS[next] });
            }}
            onSetting={(key, value) => {
              if (key === 'commissionerMode' && value === 'ON') { setAsking(true); return; }
              const settings = { ...pending.settings, [key]: value } as GmDraft['settings'];
              onPending({ ...pending, settings, difficulty: difficultyOf(settings) });
            }}
          />
          <SetupBar
            onBack={() => { onRoute('preview'); }}
            onContinue={() => { onRoute('confirmFranchise'); }}
          />
        </>
      )}

      {route === 'confirmFranchise' && pending !== null && (
        <FranchiseSummary
          slot={pending.slot}
          gmName={`${pending.first.trim()} ${pending.last.trim()}`.trim()}
          styleLabel={gmStyleLabel(pending.style)}
          team={previewing ?? null}
          settings={pending.settings}
          difficulty={pending.difficulty}
          league={boardLeague()}
          season={BOARD_SEASON}
          saveName={pending.saveName}
          onSaveName={(saveName) => { onPending({ ...pending, saveName }); }}
          busy={busy}
          onBack={() => { onRoute('franchiseSettings'); }}
          onChangeTeam={() => { onRoute('preview'); }}
          onCreate={() => { onRoute('worldGen'); }}
        />
      )}

      {route === 'worldGen' && pending !== null && (
        <RigWorldBuild
          team={previewing ?? null}
          gmName={`${pending.first.trim()} ${pending.last.trim()}`.trim()}
          slot={pending.slot}
          onBuild={() => { onStart(pending.teamId ?? ''); }}
          onMenu={onMenu}
        />
      )}

      {asking && pending !== null && (
        <Modal
          title="Enable Commissioner Mode?"
          detail="This unlocks editing tools and can affect save balance."
          onClose={() => { setAsking(false); }}
          testId="commissioner-modal"
          actions={(
            <>
              <ActionButton tone="quiet" compact onClick={() => { setAsking(false); }}>
                Cancel
              </ActionButton>
              <ActionButton
                compact
                testId="commissioner-enable"
                onClick={() => {
                  const settings = {
                    ...pending.settings, commissionerMode: 'ON',
                  } as GmDraft['settings'];
                  onPending({ ...pending, settings, difficulty: difficultyOf(settings) });
                  setAsking(false);
                }}
              >
                Enable
              </ActionButton>
            </>
          )}
        >
          <p style={{ ...TYPE.body, margin: 0, color: COLOR.tx }}>
            Ratings, rosters, teams and saves become editable.
          </p>
          <p style={{ ...TYPE.micro, margin: `${String(S[1])}px 0 0`, color: COLOR.mut }}>
            It can be turned off again from this screen.
          </p>
        </Modal>
      )}

      {/* A club the board does not have. Reported rather than blanked: the id
          came from somewhere, and "we cannot find it" is the useful thing to
          say on the screen that is about that club. */}
      {(route === 'preview' || route === 'franchiseSettings' || route === 'confirmFranchise'
        || route === 'worldGen') && previewing === undefined && (
        <p style={{ margin: `${String(S[2])}px 0`, color: COLOR.red, fontSize: 13 }}>
          No club in this league has the id “{pending?.teamId ?? ''}”.
        </p>
      )}
    </>
  );
}
