// Screens reached by drilling in rather than by a tab.
//
// Each is registered so that every target resolvable by resolveEntityRoute
// lands on a real screen. A nav target with no screen behind it is a dead end
// that only shows up when someone taps it, so the registry is asserted by test.

import { COLOR, ELEV, FONT, R, S, TYPE, colourWash } from '../app/tokens';
import { useNavigationState, useNavigator } from '../app/navigation';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { TableScroll } from '../components/TableScroll';
import {
  SkeletonLine, SkeletonRegion, SkeletonRows, SkeletonTiles,
} from '../components/Skeleton';
import { TeamMark, TeamMarkSkeleton } from '../components/TeamMark';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Loading, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import type { PlayerOut } from '../../supabase/functions/_shared/api/reads/player';
import type { GameOut } from '../../supabase/functions/_shared/api/reads/game';

/** Header shared by every entity profile: a mark, a name, a line of metadata. */
function ProfileHeader({ markSize = 48 }: { readonly markSize?: number }) {
  return (
    <Panel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <TeamMarkSkeleton size={markSize} />
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 7 }}>
          <SkeletonLine width="68%" height={16} />
          <SkeletonLine width="44%" height={11} />
        </div>
      </div>
    </Panel>
  );
}

export function PlayerScreen() {
  const { params } = useNavigationState();
  const { save, clubsById, version } = useSave();
  const id = params['id'] ?? '';
  const q = useQuery<PlayerOut>(
    'player', { saveId: save?.saveId ?? '', playerId: id }, version, save !== null && id !== '');

  if (id === '' || save === null) {
    return (
      <Screen title="Player" screen="player">
        <EmptyState title="No such player" detail="No player id was passed to this screen." />
      </Screen>
    );
  }
  if (q.status === 'loading') return <Screen title="Player" screen="player"><Loading label="Loading player" /></Screen>;
  if (q.status === 'error') {
    return (
      <Screen title="Player" screen="player">
        {q.error.message.includes('not found')
          ? <EmptyState title="No such player" detail={`Nothing on file for "${id}".`} />
          : <QueryError error={q.error} />}
      </Screen>
    );
  }

  const player = q.data;
  const club = player.teamId === null ? null : clubsById.get(player.teamId);

  return (
    <Screen title={player.name} subtitle={player.group} screen="player">
      {/* A player wears his team's colours here for the same reason the team
          screen does -- see components/TeamHero -- and a free agent wears
          none, which is itself the information. */}
      <section
        style={{
          position: 'relative', overflow: 'hidden',
          borderRadius: R.lg, border: `1px solid ${COLOR.line}`,
          background: COLOR.panel, boxShadow: ELEV.mid,
        }}
      >
        {club !== null && club !== undefined && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: colourWash(club.primary, club.secondary),
            }}
          />
        )}
        <div
          style={{
            position: 'relative', display: 'flex', alignItems: 'center',
            gap: S[3], padding: S[4], minWidth: 0,
          }}
        >
          <TeamMark
            abbreviation={player.teamId ?? 'FA'}
            primary={club?.primary ?? COLOR.line2}
            secondary={club?.secondary ?? COLOR.mut}
            size={48}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: FONT.display, fontSize: 24, fontWeight: 700,
                lineHeight: 1.1, color: COLOR.tx,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {player.name}
            </div>
            <div
              style={{
                ...TYPE.micro, color: COLOR.mut, marginTop: 3,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {club?.name ?? 'Free agent'} · {player.group} · age {player.age}
            </div>
          </div>
        </div>
      </section>

      <div style={{ marginTop: S[2] }}>
        <StatTiles stats={[
          { label: 'Overall', value: String(player.overall), tone: 'accent' },
          { label: 'Potential', value: String(player.potential) },
          { label: 'Durability', value: player.durability === null ? '—' : String(player.durability) },
        ]}
        />
      </div>

      <SectionHeader title={`${String(save.season)} season`} />
      {player.season === null ? (
        <EmptyState title="No games played yet this season" />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            <ListRow title="Games" trailing={<span style={{ color: COLOR.tx }}>{player.season.games}</span>} />
            {player.season.passYards > 0 && <ListRow title="Passing yards" trailing={<span style={{ color: COLOR.tx }}>{player.season.passYards}</span>} />}
            {player.season.rushYards > 0 && <ListRow title="Rushing yards" trailing={<span style={{ color: COLOR.tx }}>{player.season.rushYards}</span>} />}
            {player.season.recYards > 0 && <ListRow title="Receiving yards" trailing={<span style={{ color: COLOR.tx }}>{player.season.recYards}</span>} />}
            {player.season.tackles > 0 && <ListRow title="Tackles" trailing={<span style={{ color: COLOR.tx }}>{player.season.tackles}</span>} />}
          </div>
        </Panel>
      )}

      <SectionHeader title="Contract" />
      {player.contract === null ? (
        <EmptyState title="No contract" detail="This player is a free agent." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            <ListRow
              title="Average annual value"
              trailing={<span style={{ color: COLOR.tx }}>{(player.contract.aav / 1e6).toFixed(1)}M</span>}
            />
            <ListRow
              title="Years remaining"
              trailing={<span style={{ color: COLOR.tx }}>{player.contract.yearsRemaining}</span>}
            />
          </div>
        </Panel>
      )}
    </Screen>
  );
}

export function CoachScreen() {
  return (
    <Screen title="Coach" screen="coach">
      <SkeletonRegion label="Loading coach profile">
        <ProfileHeader />
        <div style={{ marginTop: 10 }}><SkeletonTiles count={3} /></div>
        <SectionHeader title="Tenure" />
        <SkeletonRows rows={4} lead={false} />
      </SkeletonRegion>
    </Screen>
  );
}

export function CollegeScreen() {
  return (
    <Screen title="College" screen="college">
      <SkeletonRegion label="Loading college">
        <ProfileHeader markSize={40} />
        <SectionHeader title="Alumni" />
        <SkeletonRows rows={6} />
      </SkeletonRegion>
    </Screen>
  );
}

export function GameScreen() {
  const { params } = useNavigationState();
  const nav = useNavigator();
  const { save, clubsById, version } = useSave();
  const gameId = params['id'] ?? '';
  const q = useQuery<GameOut>(
    'game', { saveId: save?.saveId ?? '', gameId }, version, save !== null && gameId !== '');

  if (gameId === '' || save === null || q.status === 'error') {
    return (
      <Screen title="Box score" screen="game">
        {q.status === 'error' && !q.error.message.includes('not found')
          ? <QueryError error={q.error} />
          : <EmptyState title="No such game" detail="It may belong to a season that has already rolled over." />}
      </Screen>
    );
  }
  if (q.status === 'loading') return <Screen title="Box score" screen="game"><Loading label="Loading box score" /></Screen>;

  const game = q.data;
  const home = clubsById.get(game.home.teamId);
  const away = clubsById.get(game.away.teamId);
  const total = (s: GameOut['home']): number | null =>
    s.passYards === null || s.rushYards === null ? null : s.passYards + s.rushYards;
  const show = (n: number | null): string => (n === null ? '—' : String(n));

  const rows: { label: string; home: number | null; away: number | null }[] = [
    { label: 'Points', home: game.home.score, away: game.away.score },
    { label: 'Total yards', home: total(game.home), away: total(game.away) },
    { label: 'Passing', home: game.home.passYards, away: game.away.passYards },
    { label: 'Rushing', home: game.home.rushYards, away: game.away.rushYards },
    { label: 'First downs', home: game.home.firstDowns, away: game.away.firstDowns },
    { label: 'Turnovers', home: game.home.turnovers, away: game.away.turnovers },
    { label: 'Sacks allowed', home: game.home.sacksAllowed, away: game.away.sacksAllowed },
  ];

  const th = { textAlign: 'left' as const, color: COLOR.mut, fontSize: 11, padding: '6px 8px', whiteSpace: 'nowrap' as const };
  const td = { color: COLOR.tx, fontSize: 13, padding: '6px 8px', whiteSpace: 'nowrap' as const };

  return (
    <Screen
      title="Box score"
      subtitle={`Week ${String(game.week)}${game.overtime ? ' · OT' : ''}`}
      screen="game"
    >
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <TeamMark
            abbreviation={game.away.teamId}
            primary={away?.primary ?? '#28353F'}
            secondary={away?.secondary ?? '#8698A8'}
            size={40}
          />
          <span data-testid="away-score" style={{ color: COLOR.tx, fontSize: 24, fontWeight: 700 }}>
            {game.away.score}
          </span>
          <div style={{ flex: 1, textAlign: 'center', color: COLOR.dim, fontSize: 11 }}>at</div>
          <span data-testid="home-score" style={{ color: COLOR.tx, fontSize: 24, fontWeight: 700 }}>
            {game.home.score}
          </span>
          <TeamMark
            abbreviation={game.home.teamId}
            primary={home?.primary ?? '#28353F'}
            secondary={home?.secondary ?? '#8698A8'}
            size={40}
          />
        </div>
        <div style={{ marginTop: 8, color: COLOR.mut, fontSize: 12, textAlign: 'center' }}>
          {away?.nickname ?? game.away.teamId} at {home?.nickname ?? game.home.teamId}
        </div>
      </Panel>

      <SectionHeader title="Team stats" />
      <Panel padded={false}>
        <div style={{ padding: 12 }}>
          <TableScroll>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>{away?.nickname ?? game.away.teamId}</th>
                  <th style={th} />
                  <th style={th}>{home?.nickname ?? game.home.teamId}</th>
                </tr>
              </thead>
              <tbody data-testid="box-team-stats">
                {rows.map((r) => (
                  <tr key={r.label} style={{ borderTop: `1px solid ${COLOR.line}` }}>
                    <td style={td}>{show(r.away)}</td>
                    <td style={{ ...td, color: COLOR.mut, textAlign: 'center' }}>{r.label}</td>
                    <td style={td}>{show(r.home)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </Panel>

      <SectionHeader title="Leaders" />
      {game.lines.length === 0 ? (
        <EmptyState title="No yardage recorded" />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            {game.lines.map((line) => (
              <ListRow
                key={line.playerId}
                title={line.name}
                subtitle={[
                  line.passYards > 0 ? `${String(line.passYards)} pass` : '',
                  line.rushYards > 0 ? `${String(line.rushYards)} rush` : '',
                  line.recYards > 0 ? `${String(line.recYards)} rec` : '',
                ].filter(Boolean).join(' · ')}
                trailing={<span style={{ color: COLOR.amber, fontSize: 13 }}>{line.passYards + line.rushYards + line.recYards}</span>}
                navigable
                onSelect={() => { nav.push('player', { id: line.playerId }); }}
              />
            ))}
          </div>
        </Panel>
      )}
    </Screen>
  );
}

export function DraftPickScreen() {
  return (
    <Screen title="Draft pick" screen="draftPick">
      <SkeletonRegion label="Loading draft pick">
        <ProfileHeader markSize={40} />
        <SectionHeader title="Scouting report" />
        <SkeletonRows rows={4} lead={false} />
      </SkeletonRegion>
    </Screen>
  );
}

/** Reached from the Office list. Named screens rather than a generic stub, so
 *  the registry stays honest about what exists. */
export function ScoutingScreen() {
  return (
    <Screen title="Scouting" screen="scouting">
      <SkeletonRegion label="Loading scouting department">
        <SkeletonTiles count={2} />
        <SectionHeader title="Board" />
        <SkeletonRows rows={8} />
      </SkeletonRegion>
    </Screen>
  );
}

export function TransactionsScreen() {
  return (
    <Screen title="Transactions" screen="transactions">
      <SkeletonRegion label="Loading transactions">
        <SkeletonRows rows={10} lead={false} />
      </SkeletonRegion>
    </Screen>
  );
}
