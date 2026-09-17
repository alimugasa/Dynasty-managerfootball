import { useCallback, useRef, useState } from 'react';
import { COLOR, TYPE } from '../../app/tokens';
import { useSave } from '../../app/SaveProvider';
import { useCutPreview } from '../../hooks/useCamp';
import { Modal } from '../../components/Modal';
import { ActionButton } from '../../components/ActionButton';
import { Loading, QueryError } from '../../components/QueryState';
import { TermLine, money } from '../marketRows';
import type { CutOutcome } from '../../../supabase/functions/_shared/api/handlers/campMoves';
import type { CampPlayerOut } from '../../../supabase/functions/_shared/api/reads/camp';

export function CampCutDialog({ player, onClose, onDone }: {
  readonly player: CampPlayerOut; readonly onClose: () => void;
  readonly onDone: (outcome: CutOutcome) => void;
}) {
  const { save, version, busy, notice, marketMove } = useSave();
  const q = useCutPreview(save?.saveId, player.playerId, version);
  const running = useRef(false);
  const [attempted, setAttempted] = useState(false);
  const close = useCallback(() => { if (!running.current) onClose(); }, [onClose]);
  const confirm = async (): Promise<void> => {
    if (running.current || busy !== null || q.status !== 'ready') return;
    running.current = true;
    setAttempted(true);
    try {
      const out = await marketMove<CutOutcome>('cut-player', { playerId: player.playerId });
      if (out !== null) onDone(out);
    } finally { running.current = false; }
  };
  return (
    <Modal title={`Cut ${player.name}?`} detail="A release cannot be undone. Review the current terms before confirming."
      onClose={close} testId="camp-cut-dialog" actions={<>
        <ActionButton tone="quiet" compact onClick={close} disabled={busy !== null}>Cancel</ActionButton>
        <ActionButton tone="danger" compact onClick={() => { void confirm(); }}
          disabled={q.status !== 'ready' || busy !== null} testId="camp-confirm-cut">
          {busy === null ? 'Confirm cut' : 'Releasing…'}
        </ActionButton>
      </>}>
      <div style={{ maxHeight: '48dvh', overflowY: 'auto' }}>
        {q.status === 'loading' && <Loading label="Loading cut consequences" rows={3} />}
        {q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
        {attempted && notice !== null && <p role="alert" style={{ ...TYPE.prose, color: COLOR.red }}>{notice}</p>}
        {q.status === 'ready' && <>
          <TermLine label="Player" value={`${q.data.name} · ${q.data.position} · Age ${String(q.data.age)}`} />
          <TermLine label="Current cap charge" value={money(q.data.capHit)} />
          <TermLine label="Dead money" value={money(q.data.deadMoney)} tone="warn" />
          <TermLine label="Cap savings" value={money(q.data.capSavings)} tone="good" />
          <TermLine label="Roster before → after" value={`${String(q.data.rosterBefore)} → ${String(q.data.rosterAfter)}`} />
          <TermLine label="Final roster target" value={String(q.data.rosterLimit)} />
          <TermLine label="Cuts still required afterward" value={String(q.data.cutsRemaining)} />
          <p style={{ ...TYPE.prose, color: COLOR.amber }}>
            Review the final count carefully. Camp currently has no replacement signings or waiver claims; a roster below the enforced target cannot be finalized.
          </p>
          <p style={{ ...TYPE.prose, color: COLOR.mut }}>
            {q.data.waivers ? 'He will enter waivers. Another club may claim him.' : 'He will become an unrestricted free agent.'}
          </p>
        </>}
      </div>
    </Modal>
  );
}
