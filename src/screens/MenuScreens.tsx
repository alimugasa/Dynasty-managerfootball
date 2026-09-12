// The three screens the main menu's foot opens.
//
// Thin wrappers: the panels are shared with the play-test rig, and everything
// build-specific -- which server, which save, what the client can truthfully
// say about storage -- is gathered here and handed in.

import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { COLOR, S, TYPE } from '../app/tokens';
import { ActionButton } from '../components/ActionButton';
import { Panel, SectionHeader } from '../components/Surface';
import { PHASE_LABEL } from '../domain/phase';
import { readEnv } from '../lib/env';
import { CreditsPanel, DatabaseToolsPanel, SettingsPanel, type Fact } from './menuPanels';
import { Screen } from './Screen';

export function SettingsScreen() {
  return (
    <Screen title="Settings" subtitle="Preferences" screen="settings">
      <SettingsPanel />
    </Screen>
  );
}

export function CreditsScreen() {
  return (
    <Screen title="Credits" subtitle="Who built this" screen="credits">
      <CreditsPanel />
    </Screen>
  );
}

/** The API's address, or what went wrong asking for it. */
function apiUrl(): string | null {
  try {
    return readEnv().apiUrl;
  } catch {
    // env.ts refuses a missing VITE_API_URL rather than defaulting it. That is
    // worth surfacing on the one screen whose job is to say where data lives.
    return null;
  }
}

export function DatabaseToolsScreen() {
  const nav = useNavigator();
  const { save, loaded, clubs } = useSave();

  // Only what the client has actually been told. Nothing here is computed from
  // a guess: a save that is not open reports no save, not a blank one.
  const facts: readonly Fact[] = [
    { label: 'API', value: apiUrl() },
    { label: 'Save', value: save?.saveId ?? null },
    { label: 'File', value: save?.slot === undefined || save.slot === null ? null : `Slot ${String(save.slot)}` },
    { label: 'GM', value: save?.gmName ?? null },
    { label: 'Season', value: save === null ? null : String(save.season) },
    {
      label: 'Phase',
      value: save === null ? null : (PHASE_LABEL[save.phase] ?? save.phase),
    },
    { label: 'Week', value: save === null ? null : `${String(save.week)} of ${String(save.weeks)}` },
    { label: 'Teams in memory', value: loaded ? String(clubs.length) : null },
  ];

  return (
    <Screen title="Database Tools" subtitle="Developer" screen="dbtools">
      <DatabaseToolsPanel facts={facts}>
        <SectionHeader title="Surfaces" />
        <Panel>
          <p style={{ ...TYPE.prose, margin: `0 0 ${String(S[3])}px`, color: COLOR.mut }}>
            The component gallery renders every primitive in the design system at once.
            It sits outside the navigation stack, so this opens it in place.
          </p>
          <ActionButton
            tone="quiet"
            onClick={() => { window.location.assign('/dev/components'); }}
            testId="open-gallery"
          >
            Open component gallery
          </ActionButton>
        </Panel>

        <SectionHeader title="Writing" />
        <Panel>
          <p style={{ ...TYPE.prose, margin: 0, color: COLOR.mut }}>
            Read-only. Every outcome in this game is decided on the server and the client
            never edits a row directly, so there is nothing to write from here — see
            ARCHITECTURE.md rule 2. Deleting a save file is done from the save-file screen,
            where the thing being deleted is on screen next to the button.
          </p>
          <div style={{ marginTop: S[3] }}>
            {/* "Main menu", not "Back": the app bar already has a Back arrow,
                and two controls on one screen both called Back is a coin toss
                for anyone reading the screen rather than looking at it. The
                Office uses the same words for the same journey. */}
            <ActionButton
              tone="quiet"
              onClick={() => { nav.replaceRoot('home'); }}
              testId="dbtools-menu"
            >
              Main menu
            </ActionButton>
          </div>
        </Panel>
      </DatabaseToolsPanel>
    </Screen>
  );
}
