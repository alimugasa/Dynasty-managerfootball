// Season recap: how the year ended, and who it belonged to.
//
// Everything here was decided by the engine and stored: the champion, the
// ballots, the two all-league teams, the records that fell. The screen ranks
// nothing itself.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { useUiState } from '../app/useUiState';
import { ChipRow, type Chip } from '../components/ChipRow';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { TeamMark } from '../components/TeamMark';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import type { RecapOut } from '../../supabase/functions/_shared/api/reads/recap';

const RESULT: Readonly<Record<string, string>> = {
  MISSED: 'Missed the playoffs',
  OPENING: 'Out in the opening round',
  QUARTERFINAL: 'Out in the quarterfinals',
  CONFERENCE_FINAL: 'Lost the conference final',
  RUNNER_UP: 'Lost the league final',
  CHAMPION: 'Champions',
};

export function RecapScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, clubsById, version } = useSave();
  const [chosen, setChosen] = useUiState('recapSeason', '');
  const q = useQuery<RecapOut>(
    'recap',
    { saveId: save?.saveId ?? '', ...(chosen === '' ? {} : { season: Number(chosen) }) },
    version, save !== null);

  const name = (id: string | null): string =>
    (id === null ? '—' : clubsById.get(id)?.name ?? id);
  const nick = (id: string | null): string =>
    (id === null ? '' : clubsById.get(id)?.nickname ?? id);

  return (
    <Screen
      title="Season recap"
      subtitle={q.status === 'ready' ? String(q.data.season) : ''}
      screen="recap"
    >
      {loadError !== null && <QueryError error={loadError} />}
      {loaded && save === null && <NoDynasty />}
      {save !== null && q.status === 'error' && <QueryError error={q.error} />}
      {save !== null && q.status === 'loading' && <Loading label="Loading the season" rows={8} />}
      {q.status === 'ready' && !q.data.complete && (
        <EmptyState
          title="The season is not over"
          detail="The recap is written when the final has been played."
        />
      )}
      {q.status === 'ready' && q.data.complete && (
        <>
          {q.data.seasons.length > 1 && (
            <div style={{ marginTop: 8 }}>
              <ChipRow
                chips={q.data.seasons.map((s): Chip => ({ key: String(s), label: String(s) }))}
                value={String(q.data.season)}
                onChange={setChosen}
                label="Season"
              />
            </div>
          )}

          {q.data.championTeamId !== null && (
            <Panel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <TeamMark
                  abbreviation={q.data.championTeamId}
                  primary={clubsById.get(q.data.championTeamId)?.primary ?? '#28353F'}
                  secondary={clubsById.get(q.data.championTeamId)?.secondary ?? '#8698A8'}
                  size={44}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: COLOR.amber, fontSize: 11, letterSpacing: 0.6 }}>
                    {String(q.data.season)} CHAMPIONS
                  </div>
                  <div style={{ color: COLOR.tx, fontSize: 16, fontWeight: 600 }}>
                    {name(q.data.championTeamId)}
                  </div>
                  {q.data.runnerUpTeamId !== null && (
                    <div style={{ color: COLOR.mut, fontSize: 12 }}>
                      beat {nick(q.data.runnerUpTeamId)} in the League Final
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {q.data.you !== null && (
            <>
              <SectionHeader title="Your season" />
              <Panel padded={false}>
                <div style={{ padding: '0 12px' }}>
                  <ListRow
                    title={`${String(q.data.you.wins)}-${String(q.data.you.losses)}${q.data.you.ties > 0 ? `-${String(q.data.you.ties)}` : ''}`}
                    subtitle={`${RESULT[q.data.you.playoffResult ?? 'MISSED'] ?? 'Season complete'}${q.data.you.seed === null ? '' : ` · seed ${String(q.data.you.seed)}`}`}
                    trailing={<Caption>{name(q.data.you.teamId)}</Caption>}
                  />
                </div>
              </Panel>
            </>
          )}

          <SectionHeader title="Awards" />
          {q.data.awards.length === 0 ? (
            <EmptyState title="No awards were voted this season" />
          ) : (
            <Panel padded={false}>
              <div style={{ padding: '0 12px' }} data-testid="awards">
                {q.data.awards.map((a) => (
                  <ListRow
                    key={a.code}
                    title={a.winner}
                    subtitle={`${a.name}${a.teamId === null ? '' : ` · ${nick(a.teamId)}`}${a.voteShare === null ? '' : ` · ${String(Math.round(a.voteShare * 100))}% of the vote`}`}
                    navigable={a.playerId !== null}
                    {...(a.playerId === null ? {} : {
                      onSelect: () => { nav.push('player', { id: a.playerId ?? '' }); },
                    })}
                  />
                ))}
              </div>
            </Panel>
          )}

          <SectionHeader title="All-league first team" />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }}>
              {q.data.honours.filter((h) => h.team === 'ALL_LEAGUE_FIRST').map((h) => (
                <ListRow
                  key={`${h.position}-${String(h.slot)}`}
                  title={h.name}
                  subtitle={`${h.position}${h.teamId === null ? '' : ` · ${nick(h.teamId)}`}`}
                  navigable={h.playerId !== null}
                  {...(h.playerId === null ? {} : {
                    onSelect: () => { nav.push('player', { id: h.playerId ?? '' }); },
                  })}
                />
              ))}
            </div>
          </Panel>

          <SectionHeader title="Record book" />
          {q.data.records.length === 0 ? (
            <EmptyState title="No records yet" detail="They are set as seasons are played." />
          ) : (
            <Panel padded={false}>
              <div style={{ padding: '0 12px' }}>
                {q.data.records.map((r) => (
                  <ListRow
                    key={`${r.code}-${r.scope}`}
                    title={`${r.name} · ${r.scope === 'CAREER' ? 'career' : 'season'}`}
                    subtitle={`${r.holder}${r.season === null ? '' : `, ${String(r.season)}`}${r.setThisSeason ? ' · set this season' : ''}`}
                    trailing={
                      <span style={{ color: r.setThisSeason ? COLOR.amber : COLOR.tx, fontSize: 13 }}>
                        {r.value}
                      </span>
                    }
                  />
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </Screen>
  );
}
