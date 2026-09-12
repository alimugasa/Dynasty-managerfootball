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
import { COLOR, R, S, TYPE } from '../../src/app/tokens';
import { ActionButton } from '../../src/components/ActionButton';
import { ChevronRightIcon } from '../../src/components/icons';
import { Panel } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { TeamMark } from '../../src/components/TeamMark';
import { HomeDoor, type DoorDestination } from '../../src/screens/homeDoor';
import {
  CreditsPanel, DatabaseToolsPanel, SettingsPanel, type Fact,
} from '../../src/screens/menuPanels';
import { NameField } from '../../src/screens/nameField';
import { SlotCard, SlotNumber } from '../../src/screens/slotCard';
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
 * A file with nothing in it.
 *
 * Drawn as an outline rather than a filled card, because that is what empty
 * looks like. Occupied files are solid and carry their franchise's colour, so
 * which of the three is available reads before any of the words do.
 */
function EmptySlot({ n, lit, onSelect }: {
  readonly n: number; readonly lit: boolean; readonly onSelect?: () => void;
}) {
  const inner = (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: S[2],
        padding: `${String(S[5])}px ${String(S[3])}px`,
        border: `1px dashed ${lit ? COLOR.line2 : COLOR.line}`,
        borderRadius: R.md,
        background: lit ? 'rgba(240,168,48,0.04)' : 'rgba(0,0,0,0.12)',
        minWidth: 0, width: '100%', boxSizing: 'border-box',
      }}
    >
      <SlotNumber n={n} lit={lit} />
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2, textAlign: 'left' }}>
        <span style={{ ...TYPE.body, fontWeight: 600, color: lit ? COLOR.tx : COLOR.dim }}>
          File {n}
        </span>
        <span style={{ ...TYPE.micro, color: lit ? COLOR.amber : COLOR.dim }}>
          {lit ? 'Empty · start here' : 'Empty'}
        </span>
      </span>
      {lit && (
        <span style={{ color: COLOR.dim, display: 'flex', flexShrink: 0 }}><ChevronRightIcon /></span>
      )}
    </div>
  );
  if (onSelect === undefined) return inner;
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'block', width: '100%', background: 'none', border: 0,
        padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0,
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      {inner}
    </button>
  );
}

/**
 * The save files.
 *
 * One screen, two errands, told apart by how it was opened. Starting a new
 * game, an empty file is the thing to tap and an occupied one is in the way.
 * Loading, it is the other way round.
 */
export function SlotsScreen({ creating, onOpen, onStart, onDelete }: {
  readonly creating: boolean;
  readonly onOpen: (slot: number) => void;
  readonly onStart: (slot: number) => void;
  readonly onDelete: (slot: number) => void;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);
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
                <EmptySlot
                  n={slot.slot}
                  lit={creating}
                  {...(creating ? { onSelect: () => { onStart(slot.slot); } } : {})}
                />
              </div>
            );
          }
          return (
            <div key={slot.slot} data-testid={`slot-${String(slot.slot)}`}>
              <SlotCard
                slot={slot}
                openable={!creating}
                onOpen={() => { onOpen(slot.slot); }}
                footer={confirming === slot.slot ? (
                  <>
                    <ActionButton onClick={() => { setConfirming(null); }} tone="quiet" compact>
                      Keep
                    </ActionButton>
                    <ActionButton
                      onClick={() => { setConfirming(null); onDelete(slot.slot); }}
                      compact
                      testId={`delete-confirm-${String(slot.slot)}`}
                    >
                      Delete for good
                    </ActionButton>
                  </>
                ) : (
                  <ActionButton
                    onClick={() => { setConfirming(slot.slot); }}
                    tone="quiet"
                    compact
                    testId={`delete-${String(slot.slot)}`}
                  >
                    Delete
                  </ActionButton>
                )}
              />
            </div>
          );
        })}
      </div>
      {creating && rows.every((s) => s.saveId !== null) && (
        <p style={{ ...TYPE.prose, margin: `${String(S[3])}px 2px 0`, color: COLOR.mut }}>
          Every file is in use. Delete one to start a new game in it.
        </p>
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
