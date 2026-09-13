// The save files.
//
// One screen, two errands, told apart by the mode it was pushed with. Starting
// a franchise, an empty file is the thing to tap and a filled one is in the
// way; loading one, it is the other way round. Both show all three files --
// the list is the same either way, so a player can always see what they have.
//
// The two things you can do to a file that are not opening it live behind the
// three dots on the card: renaming it, and destroying it. Both open a dialog
// naming the file, because a rename you did not mean is annoying and a delete
// you did not mean is a season.

import { useState } from 'react';
import { COLOR, R, S, TYPE, tint } from '../app/tokens';
import { useNavigationState, useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ActionButton } from '../components/ActionButton';
import { Modal } from '../components/Modal';
import { Loading, QueryError } from '../components/QueryState';
import { NameField } from './nameField';
import { Screen } from './Screen';
import { EmptySlotCard, SlotCard } from './slotCard';
import type { SlotRow, SlotsOut } from '../../supabase/functions/_shared/api/reads/slots';

/** What the screen is for, which decides everything else on it. */
type Mode = 'new' | 'load';

export function SlotsScreen() {
  const nav = useNavigator();
  const { params } = useNavigationState();
  const { openSave, deleteSave, renameSave, busy, notice, version } = useSave();
  const mode: Mode = params['mode'] === 'load' ? 'load' : 'new';
  const creating = mode === 'new';
  const q = useQuery<SlotsOut>('slots', {}, version);

  // Which file a dialog is open for, and which dialog. One at a time.
  const [renaming, setRenaming] = useState<SlotRow | null>(null);
  const [deleting, setDeleting] = useState<SlotRow | null>(null);
  const [draft, setDraft] = useState('');
  // Why the tap you just made did nothing. Cleared by the next tap that works.
  const [refused, setRefused] = useState<number | null>(null);

  const startRename = (slot: SlotRow): void => {
    setDraft(slot.name ?? '');
    setRenaming(slot);
  };

  return (
    <Screen
      title={creating ? 'New Franchise' : 'Load Franchise'}
      subtitle={creating ? 'Choose save file' : 'Save files'}
      screen="slots"
    >
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[3])}px`, color: COLOR.mut }}>
        {creating ? 'Choose a save file to start in.' : 'Choose a save file to open.'}
      </p>
      {notice !== null && (
        <p data-testid="notice" style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}>
          {notice}
        </p>
      )}

      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && <Loading label="Loading save files" rows={3} />}
      {q.status === 'ready' && (
        <div style={{ display: 'grid', gap: S[3] }} data-testid="slot-list">
          {q.data.slots.map((slot) => {
            if (slot.saveId === null) {
              return (
                // Marked rather than left to be found by its label: the card's
                // text starts with the file number, so anything matching on
                // "File 1" is matching the wrong end of the string.
                <div key={slot.slot} data-testid={`empty-slot-${String(slot.slot)}`} data-empty-slot="">
                  <EmptySlotCard
                    n={slot.slot}
                    lit={creating}
                    onSelect={() => {
                      if (!creating) { setRefused(slot.slot); return; }
                      if (busy !== null) return;
                      setRefused(null);
                      nav.push('gm', { slot: String(slot.slot) });
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

            const saveId = slot.saveId;
            return (
              <div key={slot.slot} data-testid={`slot-${String(slot.slot)}`}>
                <SlotCard
                  slot={slot}
                  openable={!creating && busy === null}
                  onOpen={() => { setRefused(null); void openSave(saveId); }}
                  onRename={() => { startRename(slot); }}
                  onDelete={() => { setDeleting(slot); }}
                />
              </div>
            );
          })}
        </div>
      )}

      {q.status === 'ready' && creating && q.data.slots.every((s) => s.saveId !== null) && (
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
                disabled={draft.trim() === '' || busy !== null}
                testId="rename-save"
                onClick={() => {
                  const id = renaming.saveId;
                  setRenaming(null);
                  if (id !== null) void renameSave(id, draft.trim());
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
                disabled={busy !== null}
                testId="delete-confirm"
                onClick={() => {
                  const id = deleting.saveId;
                  setDeleting(null);
                  if (id !== null) void deleteSave(id);
                }}
              >
                Delete
              </ActionButton>
            </>
          )}
        >
          {/* What is about to go, named, so the confirmation is about a thing
              and not about a word. */}
          <p style={{ ...TYPE.body, margin: 0, color: COLOR.tx }}>
            File {deleting.slot} · {deleting.teamName ?? 'Team unavailable'}
          </p>
          <p style={{ ...TYPE.micro, margin: `${String(S[1])}px 0 0`, color: COLOR.mut }}>
            {deleting.gmName ?? 'No GM recorded'}
          </p>
        </Modal>
      )}
    </Screen>
  );
}
