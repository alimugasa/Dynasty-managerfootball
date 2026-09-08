// League: the table, split how you want it, and who leads it in what.
//
// Two splits are on this screen and they are not the same split. The table is
// split by where a club sits -- league, conference, division -- because that is
// how the league is organised. The leaders are split by competition, because a
// seventeen-game regular season and a four-game playoff run are separate
// records that are never summed (src/domain/competition.ts). The table has no
// competition control: there is no playoff table, only a bracket.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { CompetitionToggle } from '../components/CompetitionToggle';
import { ChipRow } from '../components/ChipRow';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { useUiState } from '../app/useUiState';
import { COMPETITION_PARAM, type Competition } from '../domain/competition';
import { Screen } from './Screen';
import {
  DEFAULT_SORT, LEAGUE_ORDER, LeadersPanel, SPLIT_CHIPS, StandingsPanel,
  type Sort, type Split,
} from './leaguePanels';
import type { LeagueOut } from '../../supabase/functions/_shared/api/reads/league';

export function LeagueScreen() {
  const nav = useNavigator();
  const [split, setSplit] = useUiState<string>('leagueSplit', 'CONFERENCE');
  const [sort, setSort] = useUiState<Sort>('leagueSort', DEFAULT_SORT);
  const [competition, setCompetition] = useUiState<Competition>('leaderComp', 'REGULAR_SEASON');
  const [side, setSide] = useUiState<string>('leaderSide', 'OFFENCE');
  const [boardKey, setBoardKey] = useUiState<string>('leaderBoard', 'passYards');
  const { save, loaded, loadError, clubsById, version } = useSave();
  const q = useQuery<LeagueOut>(
    'league',
    { saveId: save?.saveId ?? '', competition: COMPETITION_PARAM[competition] },
    version, save !== null,
  );

  const nameOf = (teamId: string): string => clubsById.get(teamId)?.nickname ?? teamId;

  return (
    <Screen title="League" subtitle={save === null ? '' : String(save.season)} screen="league">
      {loadError !== null && <QueryError error={loadError} />}
      {loaded && save === null && <NoDynasty />}
      {save !== null && (
        <>
          {q.status === 'ready' && q.data.standings.some((r) => r.seed !== null) && (
            <>
              <SectionHeader title="Postseason" />
              <Panel padded={false}>
                <div style={{ padding: '0 12px' }}>
                  <ListRow
                    title={q.data.champion === null
                      ? 'The bracket is live'
                      : `${clubsById.get(q.data.champion)?.name ?? q.data.champion} are champions`}
                    subtitle={q.data.champion === null ? 'Fourteen clubs, four rounds' : String(save.season)}
                    navigable
                    onSelect={() => { nav.push('playoffs'); }}
                  />
                </div>
              </Panel>
            </>
          )}

          <SectionHeader title="Standings" />
          {q.status === 'error' && <QueryError error={q.error} />}
          {q.status === 'loading' && <Loading label="Loading standings" rows={8} />}
          {q.status === 'ready' && (
            <>
              <div style={{ marginBottom: 8 }}>
                <ChipRow chips={SPLIT_CHIPS} value={split} onChange={setSplit} label="Standings split" />
              </div>
              <StandingsPanel
                rows={q.data.standings}
                conferences={q.data.conferences}
                divisions={q.data.divisions}
                split={split as Split}
                sort={sort}
                onSort={setSort}
                userTeamId={save.userTeamId}
                nameOf={nameOf}
                onSelect={(teamId) => { nav.push('team', { id: teamId }); }}
              />
              <p style={{ margin: '6px 2px 0', color: COLOR.dim, fontSize: 11 }}>
                {sort.key === LEAGUE_ORDER
                  ? 'Ordered by the league: win percentage, then points difference.'
                  : 'Sorted by one column. League order restores the standing.'}
              </p>

              <SectionHeader title="Leaders" />
              <div style={{ marginBottom: 8 }}>
                <CompetitionToggle value={competition} onChange={setCompetition} />
              </div>
              {q.data.gamesPlayed === 0 ? (
                <EmptyState
                  title="No games played yet"
                  detail={competition === 'PLAYOFFS'
                    ? 'Leaders appear once the bracket has been played.'
                    : 'Leaders appear once a week has been simulated.'}
                />
              ) : (
                <LeadersPanel
                  boards={q.data.boards}
                  boardKey={boardKey}
                  onBoard={setBoardKey}
                  side={side}
                  onSide={setSide}
                  nameOf={nameOf}
                  onSelect={(playerId) => { nav.push('player', { id: playerId }); }}
                />
              )}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
