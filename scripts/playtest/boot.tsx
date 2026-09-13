// Getting into a dynasty, in the play-test build.
//
// The same four screens the product has, in the same order: the front door,
// the save files, the GM's name, the team. The rig used to open straight onto
// a list of thirty-two teams, which meant the build people actually played
// never showed the way into the game at all.
//
// The door, the save-file card and the name field are the product's own
// components, imported rather than copied -- that is what keeps the two builds
// from drifting apart again.

import { useState } from 'react';
import { COLOR, R, S, TYPE, tint } from '../../src/app/tokens';
import { ActionButton } from '../../src/components/ActionButton';
import { Modal } from '../../src/components/Modal';
import { Panel } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { TeamMark } from '../../src/components/TeamMark';
import { HomeDoor, type DoorDestination } from '../../src/screens/homeDoor';
import {
  CreditsPanel, DatabaseToolsPanel, SettingsPanel, type Fact,
} from '../../src/screens/menuPanels';
import { NameField } from '../../src/screens/nameField';
import { EmptySlotCard, SlotCard } from '../../src/screens/slotCard';
import type { SlotRow } from '../../supabase/functions/_shared/api/reads/slots';
import { SCHEMA_VERSION, slotRows, storageReport } from './persist';
import { clubs as allClubs } from './world';

export function HomeScreen({ onNew, onLoad, onUtility }: {
  readonly onNew: () => void;
  readonly onLoad: () => void;
  readonly onUtility: (to: DoorDestination) => void;
}) {
  return <HomeDoor onNew={onNew} onLoad={onLoad} onUtility={onUtility} />;
}

export { CreditsPanel, SettingsPanel };

/**
 * Database tools, as the rig can honestly describe itself.
 *
 * No server and no API: a dynasty here is JSON in this browser, and the screen
 * says exactly that rather than borrowing the app's answer.
 */
export function DatabaseToolsScreen() {
  const report = storageReport();
  const rows = slotRows();
  const open = rows.filter((r) => r.saveId !== null);
  const facts: readonly Fact[] = [
    { label: 'Location', value: 'This browser only' },
    { label: 'Files used', value: `${String(report.used)} of ${String(report.total)}` },
    {
      label: 'Written',
      value: report.bytes === null ? null : `${(report.bytes / 1024).toFixed(0)} KB`,
    },
    { label: 'Save schema', value: `v${String(SCHEMA_VERSION)}` },
    {
      label: 'Seasons on file',
      value: open.length === 0
        ? null
        : open.map((r) => (r.season === null ? '—' : String(r.season))).join(', '),
    },
  ];
  return (
    <DatabaseToolsPanel facts={facts}>
      <p style={{ ...TYPE.prose, margin: `${String(S[4])}px 0 0`, color: COLOR.dim }}>
        The play-test build runs the engine in the page: there is no server, and nothing
        you do here leaves this browser. Delete a file from the save-file screen, where
        the dynasty being deleted is on screen beside the button.
      </p>
    </DatabaseToolsPanel>
  );
}

/**
 * The save files.
 *
 * One screen, two errands, told apart by how it was opened. Starting a new
 * game, an empty file is the thing to tap and an occupied one is in the way.
 * Loading, it is the other way round.
 */
export function SlotsScreen({ creating, onOpen, onStart, onDelete, onRename }: {
  readonly creating: boolean;
  readonly onOpen: (slot: number) => void;
  readonly onStart: (slot: number) => void;
  readonly onDelete: (slot: number) => void;
  readonly onRename: (slot: number, name: string) => void;
}) {
  const [renaming, setRenaming] = useState<SlotRow | null>(null);
  const [deleting, setDeleting] = useState<SlotRow | null>(null);
  const [draft, setDraft] = useState('');
  const [refused, setRefused] = useState<number | null>(null);
  const rows = slotRows();

  return (
    <>
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[3])}px`, color: COLOR.mut }}>
        {creating ? 'Choose a save file to start in.' : 'Choose a save file to open.'}
      </p>
      <div style={{ display: 'grid', gap: S[3] }} data-testid="slot-list">
        {rows.map((slot) => {
          if (slot.saveId === null) {
            return (
              <div key={slot.slot} data-testid={`empty-slot-${String(slot.slot)}`} data-empty-slot="">
                <EmptySlotCard
                  n={slot.slot}
                  lit={creating}
                  onSelect={() => {
                    if (!creating) { setRefused(slot.slot); return; }
                    setRefused(null);
                    onStart(slot.slot);
                  }}
                />
                {refused === slot.slot && (
                  <p
                    data-testid={`empty-refused-${String(slot.slot)}`}
                    role="status"
                    style={{
                      ...TYPE.prose, margin: `${String(S[2])}px 0 0`,
                      padding: `${String(S[2])}px ${String(S[3])}px`,
                      borderRadius: R.sm, color: COLOR.tx,
                      background: tint(COLOR.red, 0.12),
                      border: `1px solid ${tint(COLOR.red, 0.5)}`,
                    }}
                  >
                    No franchise exists in this file.
                  </p>
                )}
              </div>
            );
          }
          return (
            <div key={slot.slot} data-testid={`slot-${String(slot.slot)}`}>
              <SlotCard
                slot={slot}
                openable={!creating}
                onOpen={() => { setRefused(null); onOpen(slot.slot); }}
                onRename={() => { setDraft(slot.name ?? ''); setRenaming(slot); }}
                onDelete={() => { setDeleting(slot); }}
              />
            </div>
          );
        })}
      </div>
      {creating && rows.every((s) => s.saveId !== null) && (
        <p style={{ ...TYPE.prose, margin: `${String(S[3])}px 2px 0`, color: COLOR.mut }}>
          Every file is in use. Delete one to start a new franchise in it.
        </p>
      )}

      {renaming !== null && (
        <Modal
          title="Rename File"
          detail={`File ${String(renaming.slot)} · ${renaming.teamName ?? 'this franchise'}`}
          onClose={() => { setRenaming(null); }}
          testId="rename-modal"
          actions={(
            <>
              <ActionButton tone="quiet" compact onClick={() => { setRenaming(null); }}>
                Cancel
              </ActionButton>
              <ActionButton
                compact
                disabled={draft.trim() === ''}
                testId="rename-save"
                onClick={() => {
                  const n = renaming.slot;
                  setRenaming(null);
                  onRename(n, draft.trim());
                }}
              >
                Save
              </ActionButton>
            </>
          )}
        >
          <NameField
            label="File name"
            value={draft}
            onChange={setDraft}
            autoFocus
            testId="rename-input"
          />
        </Modal>
      )}

      {deleting !== null && (
        <Modal
          title="Delete Franchise?"
          detail="This will permanently remove this save file."
          onClose={() => { setDeleting(null); }}
          testId="delete-modal"
          actions={(
            <>
              <ActionButton tone="quiet" compact onClick={() => { setDeleting(null); }}>
                Cancel
              </ActionButton>
              <ActionButton
                tone="danger"
                compact
                testId="delete-confirm"
                onClick={() => {
                  const n = deleting.slot;
                  setDeleting(null);
                  onDelete(n);
                }}
              >
                Delete
              </ActionButton>
            </>
          )}
        >
          <p style={{ ...TYPE.body, margin: 0, color: COLOR.tx }}>
            File {deleting.slot} · {deleting.teamName ?? 'Team unavailable'}
          </p>
          <p style={{ ...TYPE.micro, margin: `${String(S[1])}px 0 0`, color: COLOR.mut }}>
            {deleting.gmName ?? 'No GM recorded'}
          </p>
        </Modal>
      )}
    </>
  );
}

/** Who you are: a first name and a last name, and nothing else at all. */
export function CreateGmScreen({ onContinue }: {
  readonly onContinue: (first: string, last: string) => void;
}) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const ready = first.trim() !== '' && last.trim() !== '';
  const go = (): void => { if (ready) onContinue(first.trim(), last.trim()); };

  return (
    <>
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[3])}px`, color: COLOR.mut }}>
        Your name goes on the save file and on the office door. Nothing else is asked for.
      </p>
      <Panel>
        <form
          style={{ display: 'grid', gap: S[4] }}
          onSubmit={(e) => { e.preventDefault(); go(); }}
        >
          <NameField label="First name" value={first} onChange={setFirst} autoFocus testId="gm-first" />
          <NameField label="Last name" value={last} onChange={setLast} testId="gm-last" />
          <ActionButton onClick={go} disabled={!ready} testId="gm-continue">
            Continue
          </ActionButton>
        </form>
      </Panel>
      {!ready && (
        <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 2px 0`, color: COLOR.dim, fontSize: 11.5 }}>
          Both names are needed. Half a name on a save file tells you nothing.
        </p>
      )}
    </>
  );
}

/** The team you manage. The last question a new game asks. */
export function SelectTeamScreen({ busy, onPick }: {
  readonly busy: string | null;
  readonly onPick: (teamId: string) => void;
}) {
  const clubList = [...allClubs().values()];
  return (
    <>
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[3])}px`, color: COLOR.mut }}>
        Thirty-two teams, 3,066 players, the season the seed ships with. Your dynasty is
        saved in this browser only.
      </p>
      <Panel padded={false}>
        <div style={{ padding: `0 ${String(S[3])}px` }} data-testid="club-list">
          {clubList.map((club) => (
            <ListRow
              key={club.id}
              leading={(
                <TeamMark
                  abbreviation={club.id}
                  primary={club.primary}
                  secondary={club.secondary}
                  size={32}
                />
              )}
              title={club.name}
              subtitle={`${club.conferenceId} · ${club.divisionId}`}
              navigable={busy === null}
              {...(busy === null ? { onSelect: () => { onPick(club.id); } } : {})}
            />
          ))}
        </div>
      </Panel>
      {busy !== null && (
        <p style={{ ...TYPE.prose, margin: `${String(S[3])}px 0 0`, color: COLOR.amber }}>{busy}</p>
      )}
    </>
  );
}
