// The save files.
//
// One screen, two errands, told apart by the mode it was pushed with. Starting
// a new game, an empty slot is the thing to tap and an occupied one is in the
// way. Loading, it is the other way round. The list is the same either way, so
// a player can always see what they have.
//
// Deleting lives here and nowhere else. Three files and no way to clear one is
// a dead end -- fill them and a new game becomes impossible -- and mid-game is
// the wrong place to offer it, so the menu is where a save is thrown away, and
// only after a second tap says so.

import { useState } from 'react';
import { COLOR } from '../app/tokens';
import { useNavigationState, useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ActionButton } from '../components/ActionButton';
import { ListRow } from '../components/ListRow';
import { Panel } from '../components/Surface';
import { Loading, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import { SlotCard, SlotNumber } from './slotCard';
import type { SlotsOut } from '../../supabase/functions/_shared/api/reads/slots';

export function SlotsScreen() {
  const nav = useNavigator();
  const { params } = useNavigationState();
  const { openSave, deleteSave, busy, notice, version } = useSave();
  const [confirming, setConfirming] = useState<string | null>(null);
  const creating = params['mode'] !== 'load';
  const q = useQuery<SlotsOut>('slots', {}, version);

  return (
    <Screen title={creating ? 'New Game' : 'Load Game'} subtitle="Save files" screen="slots">
      <p style={{ margin: '4px 0 10px', color: COLOR.mut, fontSize: 12, lineHeight: 1.5 }}>
        {creating ? 'Choose a save file to start in.' : 'Choose a save file to open.'}
      </p>
      {notice !== null && (
        <p data-testid="notice" style={{ margin: '0 0 8px', color: COLOR.red, fontSize: 12 }}>{notice}</p>
      )}

      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && <Loading label="Loading save files" rows={3} />}
      {q.status === 'ready' && (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="slot-list">
            {q.data.slots.map((slot) => {
              if (slot.saveId === null) {
                return (
                  // Marked rather than left to be found by its label: the row's
                  // text starts with the file number, so anything matching on
                  // "File 1" is matching the wrong end of the string.
                  <div key={slot.slot} data-testid={`empty-slot-${String(slot.slot)}`} data-empty-slot="">
                    <ListRow
                      leading={<SlotNumber n={slot.slot} lit={creating} />}
                      title={<span style={{ color: creating ? COLOR.tx : COLOR.dim }}>File {slot.slot}</span>}
                      subtitle={creating ? 'Empty · start here' : 'Empty'}
                      navigable={creating}
                      {...(creating && busy === null
                        ? { onSelect: () => { nav.push('gm', { slot: String(slot.slot) }); } }
                        : {})}
                    />
                  </div>
                );
              }

              const saveId = slot.saveId;
              return (
                <div
                  key={slot.slot}
                  data-testid={`slot-${String(slot.slot)}`}
                  style={{ borderBottom: `1px solid ${COLOR.line}` }}
                >
                  <SlotCard
                    slot={slot}
                    openable={!creating && busy === null}
                    onOpen={() => { void openSave(saveId); }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0 0 10px' }}>
                    {confirming === saveId ? (
                      <>
                        <ActionButton
                          onClick={() => { setConfirming(null); }}
                          tone="quiet"
                          compact
                        >
                          Keep
                        </ActionButton>
                        <ActionButton
                          onClick={() => { setConfirming(null); void deleteSave(saveId); }}
                          disabled={busy !== null}
                          compact
                          testId={`delete-confirm-${String(slot.slot)}`}
                        >
                          Delete for good
                        </ActionButton>
                      </>
                    ) : (
                      <ActionButton
                        onClick={() => { setConfirming(saveId); }}
                        disabled={busy !== null}
                        tone="quiet"
                        compact
                        testId={`delete-${String(slot.slot)}`}
                      >
                        Delete
                      </ActionButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {q.status === 'ready' && creating && q.data.slots.every((s) => s.saveId !== null) && (
        <p style={{ margin: '10px 2px 0', color: COLOR.mut, fontSize: 12, lineHeight: 1.5 }}>
          Every file is in use. Delete one to start a new game in it.
        </p>
      )}
    </Screen>
  );
}
