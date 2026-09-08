// Playoffs: the seeds, the bracket, and who is left.
//
// Every line here comes from the playoffs handler, which reads the rows the
// week runner wrote. The bracket is not assembled in the browser; the rounds
// arrive named, and this draws them.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { TeamMark } from '../components/TeamMark';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import type { PlayoffGameOut, PlayoffsOut } from '../../supabase/functions/_shared/api/reads/playoffs';

const CONFERENCE_NAME: Readonly<Record<string, string>> = { AC: 'American', NC: 'National' };

export function PlayoffsScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, clubsById, version } = useSave();
  const q = useQuery<PlayoffsOut>('playoffs', { saveId: save?.saveId ?? '' }, version, save !== null);

  const nickname = (id: string): string => clubsById.get(id)?.nickname ?? id;
  const subtitle = save === null ? '' : String(save.season);

  return (
    <Screen title="Playoffs" subtitle={subtitle} screen="playoffs">
      {loadError !== null && <QueryError error={loadError} />}
      {loaded && save === null && <NoDynasty />}
      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && save !== null && <Loading label="Loading the bracket" rows={6} />}
      {q.status === 'ready' && !q.data.seeded && (
        <EmptyState
          title="The field is not set"
          detail="Seeds are drawn when the regular season ends. Play the season out to see the bracket."
        />
      )}
      {q.status === 'ready' && q.data.seeded && (
        <>
          {q.data.champion !== null && (
            <Panel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <TeamMark
                  abbreviation={q.data.champion}
                  primary={clubsById.get(q.data.champion)?.primary ?? '#28353F'}
                  secondary={clubsById.get(q.data.champion)?.secondary ?? '#8698A8'}
                  size={44}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: COLOR.amber, fontSize: 11, letterSpacing: 0.6 }}>
                    {String(save?.season ?? '')} CHAMPIONS
                  </div>
                  <div style={{ color: COLOR.tx, fontSize: 16, fontWeight: 600 }}>
                    {clubsById.get(q.data.champion)?.name ?? q.data.champion}
                  </div>
                  {q.data.runnerUp !== null && (
                    <div style={{ color: COLOR.mut, fontSize: 12 }}>
                      beat {nickname(q.data.runnerUp)} in the League Final
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {q.data.rounds.map((r) => {
            const games = q.data.games.filter((g) => g.round === r.round);
            if (games.length === 0) return null;
            return (
              <div key={r.round}>
                <SectionHeader title={r.label} />
                <Panel padded={false}>
                  <div style={{ padding: '0 12px' }} data-testid={`round-${r.round}`}>
                    {games.map((g) => (
                      <BracketRow
                        key={g.gameId}
                        game={g}
                        userTeamId={save?.userTeamId ?? ''}
                        name={nickname}
                        seed={(id) => q.data.seeds.find((s) => s.teamId === id)?.seed ?? 0}
                        onOpen={() => { nav.push('game', { id: g.gameId }); }}
                      />
                    ))}
                  </div>
                </Panel>
              </div>
            );
          })}

          {(['AC', 'NC'] as const).map((conference) => {
            const seeds = q.data.seeds.filter((s) => s.conferenceId === conference);
            if (seeds.length === 0) return null;
            return (
              <div key={conference}>
                <SectionHeader title={`${CONFERENCE_NAME[conference] ?? conference} seeds`} />
                <Panel padded={false}>
                  <div style={{ padding: '0 12px' }}>
                    {seeds.map((s) => (
                      <ListRow
                        key={s.teamId}
                        leading={<Seed n={s.seed} />}
                        title={clubsById.get(s.teamId)?.name ?? s.teamId}
                        subtitle={`${String(s.wins)}-${String(s.losses)}${s.ties > 0 ? `-${String(s.ties)}` : ''} · ${s.divisionWinner ? 'Division winner' : 'Wild seed'}${s.seed === 1 ? ' · rests the opening round' : ''}`}
                        {...(s.teamId === save?.userTeamId ? { trailing: <span style={{ color: COLOR.amber, fontSize: 11 }}>YOUR CLUB</span> } : {})}
                      />
                    ))}
                  </div>
                </Panel>
              </div>
            );
          })}
        </>
      )}
    </Screen>
  );
}

function Seed({ n }: { readonly n: number }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 6, background: COLOR.line,
        color: COLOR.tx, fontSize: 12, fontVariantNumeric: 'tabular-nums',
      }}
    >
      {n}
    </span>
  );
}

function BracketRow(
  { game, userTeamId, name, seed, onOpen }: {
    readonly game: PlayoffGameOut; readonly userTeamId: string;
    readonly name: (id: string) => string; readonly seed: (id: string) => number;
    readonly onOpen: () => void;
  },
) {
  const played = game.homeScore !== null && game.awayScore !== null;
  const homeWon = played && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const side = (id: string, score: number | null, won: boolean) => (
    <span style={{ color: id === userTeamId ? COLOR.amber : (played && !won ? COLOR.mut : COLOR.tx) }}>
      {name(id)}{score === null ? '' : ` ${String(score)}`}
    </span>
  );
  return (
    <ListRow
      title={
        <span style={{ fontSize: 13 }}>
          {side(game.awayTeamId, game.awayScore, played && !homeWon)}
          <span style={{ color: COLOR.dim }}>{game.neutralSite ? ' v ' : ' at '}</span>
          {side(game.homeTeamId, game.homeScore, homeWon)}
        </span>
      }
      subtitle={`${game.neutralSite ? 'Neutral ground · seeds' : 'Seeds'} ${String(seed(game.awayTeamId))} v ${String(seed(game.homeTeamId))}`}
      navigable={played}
      {...(played ? { onSelect: onOpen } : {})}
    />
  );
}
