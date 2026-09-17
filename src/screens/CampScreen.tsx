import { useCallback, useState } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { useNavigator } from '../app/navigation';
import { useUiState } from '../app/useUiState';
import { useCamp } from '../hooks/useCamp';
import { useAvatars } from '../hooks/useAvatars';
import { isCampPhase } from '../domain/phase';
import { ChipRow } from '../components/ChipRow';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { EmptyState } from '../components/Surface';
import { ActionButton } from '../components/ActionButton';
import { Screen } from './Screen';
import { CampHeader, CampOverview } from './camp/CampOverview';
import { CampRoster, CampReview } from './camp/CampRoster';
import { CampActions } from './camp/CampActions';
import { CampCutDialog } from './camp/CampCutDialog';
import type { CampPlayerOut } from '../../supabase/functions/_shared/api/reads/camp';

const NO_IDS: readonly string[] = [];

export function CampScreen() {
  const { save, loaded, loadError, version, busy } = useSave();
  const nav = useNavigator();
  const [view, setView] = useUiState('campView', 'overview');
  const [group, setGroup] = useUiState('campGroup', '');
  const [filter, setFilter] = useUiState('campFilter', 'ALL');
  const [sort, setSort] = useUiState('campSort', 'PRACTICE');
  const [direction, setDirection] = useUiState<'asc' | 'desc'>('campDirection', 'desc');
  const [selected, setSelected] = useState<CampPlayerOut | null>(null);
  const [cutMessage, setCutMessage] = useState<string | null>(null);
  const active = save !== null && isCampPhase(save.phase);
  const q = useCamp(save?.saveId, version, active);
  const d = q.status === 'ready' ? q.data : null;
  const faces = useAvatars(d?.players?.map((p) => p.playerId) ?? NO_IDS);
  const closeCut = useCallback(() => { setSelected(null); }, []);
  const selectGroup = (next: string): void => {
    setGroup(next); setFilter('ALL'); setView('battles');
  };

  return (
    <Screen title="Training Camp" {...(save === null ? {} : { subtitle: String(save.season) })} screen="camp">
      {loadError !== null && <QueryError error={loadError} />}
      {!loaded && <Loading label="Loading dynasty" />}
      {loaded && save === null && <NoDynasty />}
      {loaded && save !== null && !active && <>
        <EmptyState title="Camp is not active" detail="Training camp opens after offseason roster building. Your current phase is available from Play." />
        <ActionButton onClick={() => { nav.replaceRoot('play'); }}>Go to Play</ActionButton>
      </>}
      {active && <>
        {q.status === 'loading' && <Loading label="Loading training camp" rows={6} />}
        {q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
        {d !== null && <CampHeader data={d} />}
        {cutMessage !== null && <p role="status" style={{ ...TYPE.prose, color: COLOR.teal }}>{cutMessage}</p>}
        {/* Remains mounted during a refresh so failed actions and confirmation
            state are not lost when useQuery enters its loading state. */}
        <CampActions data={d} reviewing={view === 'review'} onReview={() => { setView('review'); }} />
        <div style={{ marginBlock: S[3] }}>
          <ChipRow label="Camp view" value={view} onChange={setView} chips={[
            { key: 'overview', label: 'Overview' }, { key: 'battles', label: 'Position battles' },
            { key: 'cuts', label: 'Cut decisions' }, { key: 'review', label: 'Final roster review' },
          ]} />
        </div>
        {d !== null && d.players?.length === 0 && <EmptyState title="No players in camp"
          detail="No roster rows were returned. Review the roster information before making a decision." />}
        {d !== null && view === 'overview' && <CampOverview data={d} onGroup={selectGroup} />}
        {d !== null && (view === 'battles' || view === 'cuts') && <CampRoster
          data={d} group={group} filter={filter} sort={sort} direction={direction}
          onGroup={setGroup} onFilter={setFilter} onSort={setSort}
          onReverse={() => { setDirection(direction === 'asc' ? 'desc' : 'asc'); }}
          onCut={(player) => { setCutMessage(null); setSelected(player); }} avatars={faces}
          busy={busy !== null} battles={view === 'battles'} />}
        {d !== null && view === 'review' && <CampReview data={d} onGroup={selectGroup} />}
        {selected !== null && <CampCutDialog player={selected} onClose={closeCut} onDone={(out) => {
          setSelected(null);
          setCutMessage(`${out.name} released. Roster now ${String(out.rosterAfter)}; ${String(out.cutsRemaining)} cuts to target.`);
        }} />}
      </>}
    </Screen>
  );
}
