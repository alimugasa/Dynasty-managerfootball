// Roster, Office and the two drill-downs, in the play-test build.

import { COLOR } from '../../src/app/tokens';
import { Caption, EmptyState, Panel, SectionHeader } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { StatTiles } from '../../src/components/StatTiles';
import { TeamMark } from '../../src/components/TeamMark';
import { ChipRow } from '../../src/components/ChipRow';
import { TableScroll } from '../../src/components/TableScroll';
import { ActionButton } from '../../src/components/ActionButton';
import type { PositionGroup } from '../../supabase/functions/_shared/engine/types';
import { capFor, type Game, type PlayedGame } from './host';
import { GROUPS, money, ordinal, record, type ScreenProps as Props } from './common';

export function RosterScreen(
  { game, open, group, setGroup, move }:
  Props & { group: string; setGroup: (key: string) => void; move: (id: string, d: -1 | 1) => void },
) {
  const order = game.depthChart[group as PositionGroup] ?? [];
  const byId = new Map(game.league.players.map((p) => [p.id, p]));
  const arrow = (disabled: boolean) => ({
    width: 44, minHeight: 44, flexShrink: 0, borderRadius: 8,
    border: `1px solid ${COLOR.line2}`, background: 'transparent',
    color: disabled ? COLOR.dim : COLOR.tx, fontSize: 16,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
  } as const);

  return (
    <>
      <div style={{ marginTop: 8 }}>
        <ChipRow chips={GROUPS} value={group} onChange={setGroup} label="Position group" />
      </div>
      <SectionHeader title={`${group} depth chart`} />
      <p style={{ margin: '0 0 8px', color: COLOR.mut, fontSize: 12, lineHeight: 1.5 }}>
        Top of the list starts. Use the arrows to change who plays.
      </p>
      {order.length === 0 ? (
        <EmptyState title={`No ${group} on the roster`} detail="The engine will field a backup out of position." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="depth-list">
            {order.map((id, index) => {
              const player = byId.get(id);
              const out = game.absence.get(id);
              return (
                <div
                  key={id}
                  data-testid={`depth-row-${String(index)}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, minHeight: 52,
                    borderBottom: `1px solid ${COLOR.line}`, minWidth: 0,
                  }}
                >
                  <span style={{
                    width: 22, color: index === 0 ? COLOR.amber : COLOR.dim,
                    fontSize: 12, fontWeight: 600, flexShrink: 0,
                  }}
                  >
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => { open('player', id); }}
                    style={{
                      flex: 1, minWidth: 0, textAlign: 'left', background: 'none',
                      border: 'none', padding: 0, cursor: 'pointer', color: COLOR.tx,
                    }}
                  >
                    <span style={{
                      display: 'block', fontSize: 14, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    >
                      {player?.name ?? id}
                    </span>
                    <span style={{ display: 'block', color: COLOR.mut, fontSize: 11 }}>
                      {player === undefined ? 'unknown'
                        : `age ${String(Math.round(player.age))} · ovr ${String(Math.round(player.ability))}`}
                      {out === undefined ? '' : ` · out ${String(out)}w`}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${player?.name ?? id} up`}
                    data-testid={`move-up-${String(index)}`}
                    disabled={index === 0}
                    onClick={() => { move(id, -1); }}
                    style={arrow(index === 0)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${player?.name ?? id} down`}
                    disabled={index === order.length - 1}
                    onClick={() => { move(id, 1); }}
                    style={arrow(index === order.length - 1)}
                  >
                    ↓
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </>
  );
}

/** How a season ended, in the league's own words. */
const PLAYOFF_RESULT: Readonly<Record<string, string>> = {
  MISSED: 'Missed the playoffs',
  OPENING: 'Out in the opening round',
  QUARTERFINAL: 'Out in the quarterfinals',
  CONFERENCE_FINAL: 'Lost the conference final',
  RUNNER_UP: 'Lost the league final',
  CHAMPION: 'Champions',
};

export function OfficeScreen({ game, open, onRestart }: Props & { onRestart: () => void }) {
  const sheet = capFor(game, game.userTeamId);
  const feed = [...game.news].reverse();
  return (
    <>
      <SectionHeader title="Salary cap" />
      <StatTiles stats={[
        { label: 'Cap', value: money(sheet.capLimit) },
        { label: 'Committed', value: money(sheet.committed) },
        { label: 'Space', value: money(sheet.available), tone: sheet.available < 0 ? 'negative' : 'positive' },
      ]}
      />

      {game.moves.length > 0 && (
        <>
          <SectionHeader title={`Offseason ${String(game.moves[0]?.season ?? '')}`} />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }} data-testid="moves">
              {game.moves.map((m, i) => (
                <ListRow
                  key={`${m.name}-${String(i)}`}
                  title={m.name}
                  subtitle={m.detail}
                  trailing={<Caption>{m.kind}</Caption>}
                />
              ))}
            </div>
          </Panel>
        </>
      )}

      <SectionHeader title="The club" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          <ListRow
            title="Season recap"
            subtitle="Champions, awards, all-league"
            navigable
            onSelect={() => { open('recap', ''); }}
          />
          <ListRow
            title="Coaching staff"
            subtitle="Who calls the plays and develops your players"
            navigable
            onSelect={() => { open('staff', ''); }}
          />
        </div>
      </Panel>

      <SectionHeader title="News" />
      {feed.length === 0 ? (
        <EmptyState title="Nothing has happened yet" detail="Stories appear as the season is played." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="news-feed">
            {feed.slice(0, 40).map((item, i) => (
              <ListRow
                key={`${String(item.week)}-${String(i)}-${item.headline}`}
                title={item.headline}
                subtitle={`Wk ${String(item.week)} · ${item.category.replace('_', ' ').toLowerCase()}`}
                trailing={<Caption>{String(item.importance)}</Caption>}
              />
            ))}
          </div>
        </Panel>
      )}

      <SectionHeader title="Dynasty history" />
      {game.history.length === 0 ? <EmptyState title="No completed seasons yet" /> : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            {[...game.history].reverse().map((h) => (
              <ListRow
                key={h.season}
                title={`${String(h.season)} · ${record(h)}`}
                subtitle={`${PLAYOFF_RESULT[h.playoffResult] ?? 'Missed the playoffs'} · champions ${game.clubs.get(h.championId)?.nickname ?? h.championId}`}
                trailing={<Caption>{ordinal(h.rank)}</Caption>}
              />
            ))}
          </div>
        </Panel>
      )}

      <div style={{ marginTop: 18 }}>
        <ActionButton onClick={onRestart} tone="quiet" testId="restart">
          Start a new dynasty
        </ActionButton>
        <p style={{ margin: '8px 0 0', color: COLOR.dim, fontSize: 11, lineHeight: 1.5 }}>
          Wipes the dynasty saved in this browser.
        </p>
      </div>
    </>
  );
}

export function PlayerScreen({ game, id }: { game: Game; id: string }) {
  const player = game.league.players.find((p) => p.id === id);
  if (player === undefined) return <EmptyState title="No such player" />;
  const club = player.teamId === null ? undefined : game.clubs.get(player.teamId);
  const totals = { pass: 0, rush: 0, rec: 0, tackles: 0, sacks: 0, games: 0 };
  for (const g of game.results) {
    for (const line of g.players) {
      if (line.playerId !== id) continue;
      totals.pass += line.passYards; totals.rush += line.rushYards;
      totals.rec += line.receivingYards; totals.tackles += line.tackles;
      totals.sacks += line.sacks; totals.games += 1;
    }
  }
  return (
    <>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <TeamMark
            abbreviation={player.teamId ?? 'FA'}
            primary={club?.primary ?? COLOR.line}
            secondary={club?.secondary ?? COLOR.mut}
            size={48}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: COLOR.tx, fontSize: 16, fontWeight: 600 }}>{player.name}</div>
            <div style={{ color: COLOR.mut, fontSize: 12 }}>
              {club?.name ?? 'Free agent'} · age {Math.round(player.age)} · {Math.round(player.experience)} yrs
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
      <SectionHeader title={`${String(game.season)} season`} />
      {totals.games === 0 ? <EmptyState title="No games played yet this season" /> : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            <ListRow title="Games" trailing={<span style={{ color: COLOR.tx }}>{totals.games}</span>} />
            {totals.pass > 0 && <ListRow title="Passing yards" trailing={<span style={{ color: COLOR.tx }}>{totals.pass}</span>} />}
            {totals.rush > 0 && <ListRow title="Rushing yards" trailing={<span style={{ color: COLOR.tx }}>{totals.rush}</span>} />}
            {totals.rec > 0 && <ListRow title="Receiving yards" trailing={<span style={{ color: COLOR.tx }}>{totals.rec}</span>} />}
            {totals.tackles > 0 && <ListRow title="Tackles" trailing={<span style={{ color: COLOR.tx }}>{totals.tackles}</span>} />}
            {totals.sacks > 0 && <ListRow title="Sacks" trailing={<span style={{ color: COLOR.tx }}>{totals.sacks}</span>} />}
          </div>
        </Panel>
      )}
      <SectionHeader title="Contract" />
      {player.contract === null ? <EmptyState title="No contract" detail="This player is a free agent." /> : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            <ListRow title="Average annual value" trailing={<span style={{ color: COLOR.tx }}>{money(player.contract.aav)}</span>} />
            <ListRow title="Years remaining" trailing={<span style={{ color: COLOR.tx }}>{player.contract.yearsRemaining}</span>} />
          </div>
        </Panel>
      )}
    </>
  );
}

export function BoxScore({ game, id, open }: Props & { id: string }) {
  // A playoff game is not in the season's results: the two competitions are
  // kept apart, as they are in the database.
  const played: PlayedGame | undefined = [...game.results, ...game.playoffs]
    .find((g) => g.gameId === id);
  if (played === undefined) {
    return <EmptyState title="No such game" detail="It may belong to a season that has rolled over." />;
  }
  const home = game.clubs.get(played.homeTeamId);
  const away = game.clubs.get(played.awayTeamId);
  const byId = new Map(game.league.players.map((p) => [p.id, p]));
  const rows = [
    { label: 'Points', home: played.home.score, away: played.away.score },
    { label: 'Total yards', home: played.home.passYards + played.home.rushYards, away: played.away.passYards + played.away.rushYards },
    { label: 'Passing', home: played.home.passYards, away: played.away.passYards },
    { label: 'Rushing', home: played.home.rushYards, away: played.away.rushYards },
    { label: 'First downs', home: played.home.firstDowns, away: played.away.firstDowns },
    { label: 'Turnovers', home: played.home.turnovers, away: played.away.turnovers },
    { label: 'Sacks allowed', home: played.home.sacksAllowed, away: played.away.sacksAllowed },
  ];
  const leaders = [...played.players]
    .map((line) => ({ line, player: byId.get(line.playerId), total: line.passYards + line.rushYards + line.receivingYards }))
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const th = { textAlign: 'left' as const, color: COLOR.mut, fontSize: 11, padding: '6px 8px', whiteSpace: 'nowrap' as const };
  const td = { color: COLOR.tx, fontSize: 13, padding: '6px 8px', whiteSpace: 'nowrap' as const };

  return (
    <>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <TeamMark abbreviation={played.awayTeamId} primary={away?.primary ?? COLOR.line} secondary={away?.secondary ?? COLOR.mut} size={40} />
          <span data-testid="away-score" style={{ color: COLOR.tx, fontSize: 24, fontWeight: 700 }}>{played.awayScore}</span>
          <div style={{ flex: 1, textAlign: 'center', color: COLOR.dim, fontSize: 11 }}>at</div>
          <span data-testid="home-score" style={{ color: COLOR.tx, fontSize: 24, fontWeight: 700 }}>{played.homeScore}</span>
          <TeamMark abbreviation={played.homeTeamId} primary={home?.primary ?? COLOR.line} secondary={home?.secondary ?? COLOR.mut} size={40} />
        </div>
        <div style={{ marginTop: 8, color: COLOR.mut, fontSize: 12, textAlign: 'center' }}>
          {away?.nickname ?? played.awayTeamId} at {home?.nickname ?? played.homeTeamId}
        </div>
      </Panel>
      <SectionHeader title="Team stats" />
      <Panel padded={false}>
        <div style={{ padding: 12 }}>
          <TableScroll>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>{away?.nickname ?? played.awayTeamId}</th>
                  <th style={th} />
                  <th style={th}>{home?.nickname ?? played.homeTeamId}</th>
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
              onSelect={() => { open('player', line.playerId); }}
            />
          ))}
        </div>
      </Panel>
    </>
  );
}
