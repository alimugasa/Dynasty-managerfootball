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
import { COLOR, R, S, TYPE } from '../app/tokens';
import { useNavigationState, useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ActionButton } from '../components/ActionButton';
import { ChevronRightIcon } from '../components/icons';
import { Loading, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import { SlotCard, SlotNumber } from './slotCard';
import type { SlotsOut } from '../../supabase/functions/_shared/api/reads/slots';

/**
 * A file with nothing in it.
 *
 * Drawn as an outline rather than a filled card, because that is what empty
 * looks like: the dashed edge says the space is real and the space is free.
 * Occupied files are solid and carry their franchise's colour, so which of the
 * three is available reads before any of the words do.
 */
function EmptySlot({
  n, lit, onSelect,
}: {
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

export function SlotsScreen() {
  const nav = useNavigator();
  const { params } = useNavigationState();
  const { openSave, deleteSave, busy, notice, version } = useSave();
  const [confirming, setConfirming] = useState<string | null>(null);
  const creating = params['mode'] !== 'load';
  const q = useQuery<SlotsOut>('slots', {}, version);

  return (
    <Screen title={creating ? 'New Game' : 'Load Game'} subtitle="Save files" screen="slots">
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[3])}px`, color: COLOR.mut }}>
        {creating ? 'Choose a save file to start in.' : 'Choose a save file to open.'}
      </p>
      {notice !== null && (
        <p data-testid="notice" style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}>{notice}</p>
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
                  <EmptySlot
                    n={slot.slot}
                    lit={creating}
                    {...(creating && busy === null
                      ? { onSelect: () => { nav.push('gm', { slot: String(slot.slot) }); } }
                      : {})}
                  />
                </div>
              );
            }

            const saveId = slot.saveId;
            return (
              <div key={slot.slot} data-testid={`slot-${String(slot.slot)}`}>
                <SlotCard
                  slot={slot}
                  openable={!creating && busy === null}
                  onOpen={() => { void openSave(saveId); }}
                  footer={confirming === saveId ? (
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
                />
              </div>
            );
          })}
        </div>
      )}

      {q.status === 'ready' && creating && q.data.slots.every((s) => s.saveId !== null) && (
        <p style={{ ...TYPE.prose, margin: `${String(S[3])}px 2px 0`, color: COLOR.mut }}>
          Every file is in use. Delete one to start a new game in it.
        </p>
      )}
    </Screen>
  );
}
