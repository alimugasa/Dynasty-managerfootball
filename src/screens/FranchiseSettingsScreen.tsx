// How this franchise will be played, wired to the flow.
//
// Still nothing written. The eight rules and the difficulty land in the
// franchise setup draft beside the file, the names, the style and the club;
// Confirm Franchise is the screen that turns all of it into a dynasty.
//
// Two things happen here that are not just recording a choice. Picking Easy,
// Normal or Hard sets all eight rows at once, because that is what a preset
// is. And turning on Commissioner Mode asks first: it unlocks tools that can
// rewrite a save, and a tap that far-reaching should take two.

import { useState } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { useFranchiseSetup } from '../app/FranchiseSetup';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ActionButton } from '../components/ActionButton';
import { Modal } from '../components/Modal';
import { QueryError } from '../components/QueryState';
import { SetupBar } from '../components/SetupBar';
import { SkeletonLine, SkeletonRegion } from '../components/Skeleton';
import { Screen } from './Screen';
import { FranchiseSettingsBody } from './franchiseSettings';
import {
  PRESETS, difficultyOf, type Difficulty, type SettingKey,
} from '../../supabase/functions/_shared/api/franchiseOptions';
import type { TeamProfilesOut } from '../../supabase/functions/_shared/api/reads/teamProfiles';

export function FranchiseSettingsScreen() {
  const nav = useNavigator();
  const { draft, record } = useFranchiseSetup();
  const { notice, version } = useSave();
  const q = useQuery<TeamProfilesOut>('team-profiles', {}, version);
  // Open only while the player is being asked whether they meant it.
  const [asking, setAsking] = useState(false);

  const first = draft?.firstName.trim() ?? '';
  const last = draft?.lastName.trim() ?? '';
  const teamId = draft?.teamId ?? null;
  const ready = draft !== null && first !== '' && last !== '' && teamId !== null;
  const team = q.status === 'ready' && teamId !== null
    ? q.data.teams.find((t) => t.teamId === teamId) ?? null
    : null;

  const setDifficulty = (next: Difficulty): void => {
    if (draft === null) return;
    // Custom keeps whatever the rows are; the three presets replace all eight.
    record(next === 'CUSTOM'
      ? { difficulty: next }
      : { difficulty: next, settings: PRESETS[next] });
  };

  const setSetting = (key: SettingKey, value: string): void => {
    if (draft === null) return;
    if (key === 'commissionerMode' && value === 'ON') { setAsking(true); return; }
    const settings = { ...draft.settings, [key]: value } as typeof draft.settings;
    // The difficulty follows the rows: eight rows that happen to match Hard are
    // Hard, and eight that match nothing are Custom.
    record({ settings, difficulty: difficultyOf(settings) });
  };

  const enableCommissioner = (): void => {
    if (draft === null) return;
    const settings = { ...draft.settings, commissionerMode: 'ON' } as typeof draft.settings;
    record({ settings, difficulty: difficultyOf(settings) });
    setAsking(false);
  };

  return (
    <Screen
      title="Franchise Settings"
      subtitle={ready && team !== null
        ? `${team.teamName} · File ${String(draft.slot)}`
        : ready ? `File ${String(draft.slot)}` : ''}
      screen="franchiseSettings"
    >
      {!ready && (
        <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0`, color: COLOR.red }}>
          This screen was opened before a file, a GM and a team were chosen. Go back and
          start again from New Franchise.
        </p>
      )}
      {notice !== null && (
        <p data-testid="notice" style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}>
          {notice}
        </p>
      )}

      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && (
        <SkeletonRegion label="Loading the franchise">
          <div style={{ display: 'grid', gap: S[3], marginTop: S[4] }}>
            <SkeletonLine height={92} radius={16} />
            <SkeletonLine height={120} radius={10} />
            <SkeletonLine height={240} radius={10} />
          </div>
        </SkeletonRegion>
      )}

      {q.status === 'ready' && ready && (
        <>
          <FranchiseSettingsBody
            gmName={`${first} ${last}`}
            team={team}
            season={q.data.season}
            settings={draft.settings}
            difficulty={draft.difficulty}
            onDifficulty={setDifficulty}
            onSetting={setSetting}
          />
          <SetupBar
            onBack={() => { nav.back(); }}
            onContinue={() => { nav.push('confirmFranchise'); }}
          />
        </>
      )}

      {asking && (
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
              <ActionButton compact testId="commissioner-enable" onClick={enableCommissioner}>
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
    </Screen>
  );
}
