import { useLeagueIntelligence } from '../../hooks/useLeagueIntelligence';
import { useNavigator } from '../../app/navigation';
import { COLOR, S, TYPE } from '../../app/tokens';
import { ActionButton } from '../../components/ActionButton';
import { QueryError } from '../../components/QueryState';

export function IntelligenceEntry() {
  const q = useLeagueIntelligence(); const nav = useNavigator();
  if (q.status === 'error') return <QueryError error={q.error} onRetry={q.retry} />;
  if (q.status !== 'ready') return <p style={TYPE.prose}>Reading league outlook…</p>;
  const c = q.data.calendar;
  return <div style={{ display: 'grid', gap: S[2], marginBlock: S[3] }}>
    {c.pictureActive && <ActionButton tone={c.lateSeason ? 'primary' : 'quiet'}
      onClick={() => { nav.push('playoffPicture'); }} testId="to-picture">Playoff Picture</ActionButton>}
    {c.awardsActive && <ActionButton tone="quiet" onClick={() => { nav.push('awardRaces'); }} testId="to-races">Award Races</ActionButton>}
    <ActionButton tone="quiet" onClick={() => { nav.push('teamRankings'); }} testId="to-rankings">Team Rankings · Regular season</ActionButton>
    {c.phase === 'REGULAR_SEASON' && (!c.pictureActive || !c.awardsActive) && <p style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut }}>
      {!c.awardsActive && 'Award races open after week ' + String(c.awardFromWeek) + '. '}
      {!c.pictureActive && 'Playoff Picture opens after week ' + String(c.pictureFromWeek) + '.'}
    </p>}
  </div>;
}
