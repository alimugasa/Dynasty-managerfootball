import { useCallback, useRef, useState } from 'react';
import { COLOR, S, TYPE } from '../../app/tokens';
import { useSave } from '../../app/SaveProvider';
import { useNavigator } from '../../app/navigation';
import { ActionButton } from '../../components/ActionButton';
import { Modal } from '../../components/Modal';
import type { CampOut } from '../../../supabase/functions/_shared/api/reads/camp';
import type { CampStepOutcome, FinalizeOutcome } from '../../../supabase/functions/_shared/api/handlers/campMoves';

export function CampActions({ data: d, reviewing, onReview }: {
  readonly data: CampOut | null; readonly reviewing: boolean; readonly onReview: () => void;
}) {
  const { busy, notice, marketMove } = useSave();
  const nav = useNavigator();
  const running = useRef(false);
  const [confirmation, setConfirmation] = useState<CampOut | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const close = useCallback(() => { if (!running.current) setConfirmation(null); }, []);

  const advance = async (route: 'advance-camp' | 'finalize-roster'): Promise<void> => {
    if (running.current || busy !== null) return;
    running.current = true;
    setMessage(null);
    setAttempted(true);
    try {
      if (route === 'finalize-roster') {
        const out = await marketMove<FinalizeOutcome>(route, {});
        if (out === null) return;
        setConfirmation(null);
        if (out.finalized) { nav.replaceRoot('play'); return; }
        setMessage(out.fault);
      } else {
        const out = await marketMove<CampStepOutcome>(route, {});
        if (out === null) return;
        setMessage(out.blockedBy ?? out.summary);
        if (out.game !== null && out.game.abandoned.length > 0) {
          setMessage(`${out.summary} Games could not be played: ${out.game.abandoned.join(', ')}`);
        }
        if (out.phase === 'FINAL_CUTS') onReview();
      }
    } finally { running.current = false; }
  };

  return (
    <div style={{ display: 'grid', gap: S[2], marginBlock: S[3] }}>
      {message !== null && <p role="status" style={{ ...TYPE.prose, color: COLOR.amber }}>{message}</p>}
      {attempted && notice !== null && <p role="alert" style={{ ...TYPE.prose, color: COLOR.red }}>{notice}</p>}
      {d !== null && d.progress.active && <>
        {reviewing ? <>
          {d.progress.finalizeFault !== null && <p style={{ ...TYPE.prose, color: COLOR.amber }} data-testid="camp-advance-blocked">{d.progress.finalizeFault}</p>}
          <ActionButton disabled={busy !== null || d.progress.finalizeFault !== null}
            onClick={() => { setAttempted(false); setConfirmation(d); }} testId="camp-finalize">
            {d.phase === 'FINAL_CUTS' ? 'Confirm opening roster' : 'Finalize roster early'}
          </ActionButton>
        </> : d.progress.advanceRoute === 'finalize-roster'
          ? <ActionButton onClick={onReview} disabled={busy !== null} testId="camp-to-review">Review final roster</ActionButton>
          : d.progress.advanceRoute === 'advance-camp' && <ActionButton
            disabled={busy !== null || d.progress.advanceFault !== null}
            onClick={() => { void advance('advance-camp'); }} testId="camp-advance">
            {busy ?? d.progress.advanceLabel}
          </ActionButton>}
      </>}
      {confirmation !== null && <Modal title="Confirm the opening roster" onClose={close}
        detail={confirmation.phase === 'FINAL_CUTS' ? 'This signs off your roster and opens regular-season week 1.'
          : 'This ends camp and skips any remaining preseason games. Regular-season week 1 opens next.'}
        actions={<>
          <ActionButton compact tone="quiet" onClick={close} disabled={busy !== null}>Keep reviewing</ActionButton>
          <ActionButton compact onClick={() => { void advance('finalize-roster'); }} disabled={busy !== null}
            testId="camp-confirm-finalize">{busy ?? 'Start the season'}</ActionButton>
        </>}>
        <p style={TYPE.prose}>{confirmation.rosterCount} players · target {confirmation.rosterLimit}</p>
        {!confirmation.limitEnforced && <p style={TYPE.prose}>Commissioner mode: the target is advisory.</p>}
        {attempted && notice !== null && <p role="alert" style={{ ...TYPE.prose, color: COLOR.red }}>{notice}</p>}
      </Modal>}
    </div>
  );
}
