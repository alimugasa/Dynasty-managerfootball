import { useRef, useState } from 'react';
import { useSave } from '../../app/SaveProvider';
import { useNavigator } from '../../app/navigation';
import { COLOR, S, TYPE } from '../../app/tokens';
import { ActionButton } from '../../components/ActionButton';
import { Modal } from '../../components/Modal';
import type { DepthChartOut } from '../../../supabase/functions/_shared/api/reads/depthChartTypes';
import type { FinalizeOutcome } from '../../../supabase/functions/_shared/api/handlers/campMoves';

export function DepthActions({ data: d, onAuto, busy }: {
  readonly data: DepthChartOut | null; readonly onAuto: () => Promise<void>; readonly busy: boolean;
}) {
  const nav = useNavigator();
  const { marketMove, notice } = useSave();
  const [confirm, setConfirm] = useState<'AUTO' | 'FINALIZE' | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const running = useRef(false);
  const execute = async (): Promise<void> => {
    if (busy || running.current) return;
    running.current = true; setFault(null);
    try {
      if (confirm === 'AUTO') { setConfirm(null); await onAuto(); }
      else {
        const out = await marketMove<FinalizeOutcome>('finalize-roster', {});
        if (out !== null) {
          if (out.finalized) { setConfirm(null); }
          else setFault(out.fault);
        }
      }
    } finally { running.current = false; }
  };
  return <div style={{ display: 'grid', gap: S[2], marginBlock: S[3] }}>
    {d !== null && <ActionButton tone="quiet" disabled={busy} onClick={() => { setConfirm('AUTO'); }}>Auto-order all positions</ActionButton>}
    {d?.action === 'FINALIZE' && <ActionButton disabled={busy || !d.canFinalize}
      onClick={() => { setFault(null); setConfirm('FINALIZE'); }} testId="depth-finalize">Confirm roster &amp; enter Week 1</ActionButton>}
    {d?.action === 'PLAY' && <ActionButton onClick={() => { nav.replaceRoot('play'); }} testId="depth-to-play">Continue to {d.week === 1 ? 'Week 1' : 'Play'}</ActionButton>}
    {d?.action === 'CAMP' && <ActionButton onClick={() => { nav.push('camp'); }}>Continue Training Camp</ActionButton>}
    {d?.action === 'OFFSEASON' && <ActionButton onClick={() => { nav.push('offseason'); }}>Continue offseason</ActionButton>}
    <ActionButton tone="quiet" onClick={() => { nav.push('roster'); }}>View roster</ActionButton>
    {confirm !== null && <Modal title={confirm === 'AUTO' ? 'Replace your depth order?' : 'Confirm the opening roster'}
      onClose={() => { if (!busy) setConfirm(null); }}
      detail={confirm === 'AUTO' ? 'Uses the existing ability-and-experience ordering for every position. This overwrites your choices and can place injured players first.'
        : 'The server checks the roster and opens regular-season week 1. No game is simulated.'}
      actions={<>
        <ActionButton compact tone="quiet" disabled={busy} onClick={() => { setConfirm(null); }}>Cancel</ActionButton>
        <ActionButton compact disabled={busy} onClick={() => { void execute(); }} testId="depth-confirm">
          {busy ? 'Saving…' : confirm === 'AUTO' ? 'Replace order' : 'Enter Week 1'}
        </ActionButton>
      </>}>
      {fault !== null && <p role="alert" style={{ ...TYPE.prose, color: COLOR.red }}>{fault}</p>}
      {notice !== null && <p role="alert" style={{ ...TYPE.prose, color: COLOR.red }}>{notice}</p>}
    </Modal>}
  </div>;
}
