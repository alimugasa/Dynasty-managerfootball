import { useSave } from '../app/SaveProvider';
import { useNavigator } from '../app/navigation';
import { useLeagueIntelligence } from '../hooks/useLeagueIntelligence';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { EmptyState } from '../components/Surface';
import { ActionButton } from '../components/ActionButton';
import { COLOR, TYPE } from '../app/tokens';
import { Screen } from './Screen';
import { PicturePanel, RacesPanel, RankingsPanel } from './league/IntelligencePanels';

type Mode = 'picture' | 'races' | 'rankings';
function IntelligenceScreen({ mode }: { readonly mode: Mode }) {
  const { save, loaded, loadError } = useSave();
  const nav = useNavigator(); const q = useLeagueIntelligence();
  const title = mode === 'picture' ? 'Playoff Picture' : mode === 'races' ? 'Award Races' : 'Team Rankings';
  const d = q.status === 'ready' ? q.data : null;
  const active = d !== null && (mode === 'rankings' || (mode === 'picture' ? d.calendar.pictureActive : d.calendar.awardsActive));
  const regular = d?.calendar.phase === 'REGULAR_SEASON';
  return <Screen title={title} subtitle={d === null ? '' : String(d.calendar.season) + ' · Regular season'} screen={mode}>
    {loadError !== null ? <QueryError error={loadError} /> : !loaded ? <Loading label={'Loading ' + title} />
      : save === null ? <NoDynasty /> : <>
        {q.status === 'loading' && <Loading label={'Loading ' + title} />}
        {q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
        {d !== null && <>
          <p style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut }}>Through completed week {d.calendar.throughWeek} of {d.calendar.weeks}</p>
          {!active ? <>
            <EmptyState title={regular ? 'The race has not opened yet' : 'Regular-season race closed'}
              detail={regular ? 'Available after completed week ' + String(mode === 'picture' ? d.calendar.pictureFromWeek : d.calendar.awardFromWeek) + '.'
                : 'Follow the actual bracket and final season record from the League hub.'} />
            {!regular && <ActionButton onClick={() => { nav.push(mode === 'picture' ? 'playoffs' : 'recap'); }}>
              {mode === 'picture' ? 'View actual postseason' : 'View awards and records'}</ActionButton>}
          </> : mode === 'picture' ? <PicturePanel data={d} /> : mode === 'races' ? <RacesPanel data={d} /> : <RankingsPanel data={d} />}
          <ActionButton tone="quiet" onClick={() => { nav.replaceRoot('league'); }}>League hub</ActionButton>
        </>}
      </>}
  </Screen>;
}
export const PlayoffPictureScreen = () => <IntelligenceScreen mode="picture" />;
export const AwardRacesScreen = () => <IntelligenceScreen mode="races" />;
export const TeamRankingsScreen = () => <IntelligenceScreen mode="rankings" />;
