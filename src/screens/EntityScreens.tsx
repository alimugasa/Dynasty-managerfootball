// Screens reached by drilling in rather than by a tab.
//
// Each is registered so that every target resolvable by resolveEntityRoute
// lands on a real screen. A nav target with no screen behind it is a dead end
// that only shows up when someone taps it, so the registry is asserted by test.

import { COLOR } from '../app/tokens';
import { useNavigationState, useNavigator } from '../app/navigation';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { TableScroll } from '../components/TableScroll';
import {
  SkeletonLine, SkeletonRegion, SkeletonRows, SkeletonTiles,
} from '../components/Skeleton';
import { TeamMark, TeamMarkSkeleton } from '../components/TeamMark';
import { useGame } from '../game/GameProvider';
import { playerById } from '../game/store';
import { Screen } from './Screen';

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
  const { state } = useGame();
  const id = params['id'] ?? '';
  const player = playerById(state, id);

  if (player === undefined) {
    return (
      <Screen title="Player" screen="player">
        <EmptyState
          title="No such player"
          detail={id === '' ? 'No player id was passed to this screen.' : `Nothing on file for "${id}".`}
        />
      </Screen>
    );
  }

  const totals = { pass: 0, rush: 0, rec: 0, tackles: 0, games: 0 };
  for (const game of state.results) {
    for (const line of game.players) {
      if (line.playerId !== id) continue;
      totals.pass += line.passYards;
      totals.rush += line.rushYards;
      totals.rec += line.receivingYards;
      totals.tackles += line.tackles;
      totals.games += 1;
    }
  }

  const club = player.teamId === null ? null : state.identities.get(player.teamId);

  return (
    <Screen title={player.name} subtitle={player.group} screen="player">
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <TeamMark
            abbreviation={player.teamId ?? 'FA'}
            primary={club?.primary ?? '#28353F'}
            secondary={club?.secondary ?? '#8698A8'}
            size={48}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: COLOR.tx, fontSize: 16, fontWeight: 600 }}>{player.name}</div>
            <div style={{ color: COLOR.mut, fontSize: 12 }}>
              {club?.name ?? 'Free agent'} · age {player.age} · {player.experience} yrs
            </div>
          </div>
        </div>
      </Panel>

      <div style={{ marginTop: 10 }}>
        <StatTiles stats={[
          { label: 'Overall', value: String(Math.round(player.ability)), tone: 'accent' },
          { label: 'Potential', value: String(Math.round(player.potential)) },
          { label: 'Durability', value: String(Math.round(player.durability)) },
        ]}
        />
      </div>

      <SectionHeader title={`${String(state.season)} season`} />
      {totals.games === 0 ? (
        <EmptyState title="No games played yet this season" />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            <ListRow title="Games" trailing={<span style={{ color: COLOR.tx }}>{totals.games}</span>} />
            {totals.pass > 0 && <ListRow title="Passing yards" trailing={<span style={{ color: COLOR.tx }}>{totals.pass}</span>} />}
            {totals.rush > 0 && <ListRow title="Rushing yards" trailing={<span style={{ color: COLOR.tx }}>{totals.rush}</span>} />}
            {totals.rec > 0 && <ListRow title="Receiving yards" trailing={<span style={{ color: COLOR.tx }}>{totals.rec}</span>} />}
            {totals.tackles > 0 && <ListRow title="Tackles" trailing={<span style={{ color: COLOR.tx }}>{totals.tackles}</span>} />}
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
  const { state } = useGame();
  const game = state.results.find((g) => g.gameId === (params['id'] ?? ''));

  if (game === undefined) {
    return (
      <Screen title="Box score" screen="game">
        <EmptyState
          title="No such game"
          detail="It may belong to a season that has already rolled over."
        />
      </Screen>
    );
  }

  const home = state.identities.get(game.homeTeamId);
  const away = state.identities.get(game.awayTeamId);
  const byId = new Map(state.league.players.map((p) => [p.id, p]));

  const rows: { label: string; home: number; away: number }[] = [
    { label: 'Points', home: game.home.score, away: game.away.score },
    { label: 'Total yards', home: game.home.passYards + game.home.rushYards, away: game.away.passYards + game.away.rushYards },
    { label: 'Passing', home: game.home.passYards, away: game.away.passYards },
    { label: 'Rushing', home: game.home.rushYards, away: game.away.rushYards },
    { label: 'First downs', home: game.home.firstDowns, away: game.away.firstDowns },
    { label: 'Turnovers', home: game.home.turnovers, away: game.away.turnovers },
    { label: 'Sacks allowed', home: game.home.sacksAllowed, away: game.away.sacksAllowed },
  ];

  const leaders = [...game.players]
    .map((line) => ({
      line,
      player: byId.get(line.playerId),
      total: line.passYards + line.rushYards + line.receivingYards,
    }))
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

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
            abbreviation={game.awayTeamId}
            primary={away?.primary ?? '#28353F'}
            secondary={away?.secondary ?? '#8698A8'}
            size={40}
          />
          <span data-testid="away-score" style={{ color: COLOR.tx, fontSize: 24, fontWeight: 700 }}>
            {game.awayScore}
          </span>
          <div style={{ flex: 1, textAlign: 'center', color: COLOR.dim, fontSize: 11 }}>at</div>
          <span data-testid="home-score" style={{ color: COLOR.tx, fontSize: 24, fontWeight: 700 }}>
            {game.homeScore}
          </span>
          <TeamMark
            abbreviation={game.homeTeamId}
            primary={home?.primary ?? '#28353F'}
            secondary={home?.secondary ?? '#8698A8'}
            size={40}
          />
        </div>
        <div style={{ marginTop: 8, color: COLOR.mut, fontSize: 12, textAlign: 'center' }}>
          {away?.nickname ?? game.awayTeamId} at {home?.nickname ?? game.homeTeamId}
        </div>
      </Panel>

      <SectionHeader title="Team stats" />
      <Panel padded={false}>
        <div style={{ padding: 12 }}>
          <TableScroll>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>{away?.nickname ?? game.awayTeamId}</th>
                  <th style={th} />
                  <th style={th}>{home?.nickname ?? game.homeTeamId}</th>
                </tr>
              </thead>
              <tbody data-testid="box-team-stats">
                {rows.map((r) => (
                  <tr key={r.label} style={{ borderTop: `1px solid ${COLOR.line}` }}>
                    <td style={td}>{r.away}</td>
                    <td style={{ ...td, color: COLOR.mut, textAlign: 'center' }}>{r.label}</td>
                    <td style={td}>{r.home}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </Panel>

      <SectionHeader title="Leaders" />
      {leaders.length === 0 ? (
        <EmptyState title="No yardage recorded" />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            {leaders.map(({ line, player, total }) => (
              <ListRow
                key={line.playerId}
                title={player?.name ?? line.playerId}
                subtitle={[
                  line.passYards > 0 ? `${String(line.passYards)} pass` : '',
                  line.rushYards > 0 ? `${String(line.rushYards)} rush` : '',
                  line.receivingYards > 0 ? `${String(line.receivingYards)} rec` : '',
                ].filter(Boolean).join(' · ')}
                trailing={<span style={{ color: COLOR.amber, fontSize: 13 }}>{total}</span>}
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

export function StaffScreen() {
  return (
    <Screen title="Staff" screen="staff">
      <SkeletonRegion label="Loading coaching staff">
        <SkeletonRows rows={6} />
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
