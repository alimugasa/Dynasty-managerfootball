// Team, League and Schedule, in the play-test build. Same components and
// tokens as the app.

import { COLOR } from '../../src/app/tokens';
import { Caption, EmptyState, Panel, SectionHeader } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { StatTiles } from '../../src/components/StatTiles';
import { TeamMark } from '../../src/components/TeamMark';
import { ChipRow } from '../../src/components/ChipRow';
import { TableScroll } from '../../src/components/TableScroll';
import { ActionButton } from '../../src/components/ActionButton';
import { ranking, squad } from './host';
import { nextRound, ROUND_LABEL, type PlayoffRound } from './postseason';
import { ordinal, record, type ScreenProps as Props } from './common';


export function TeamScreen(
  { game, open, busy, onWeek, onSeason, onOffseason, onBracket }:
  Props & {
    busy: string | null; onWeek: () => void; onSeason: () => void;
    onOffseason: () => void; onBracket: () => void;
  },
) {
  const club = game.clubs.get(game.userTeamId);
  const standing = game.standings.get(game.userTeamId);
  const done = game.phase === 'OFFSEASON';
  const inPlayoffs = game.phase === 'PLAYOFFS';
  const { round, champion } = game.seeds.length === 0
    ? { round: null, champion: null } : nextRound(game);
  const roundLabel = round === null ? null : ROUND_LABEL[round];
  const mine = [...game.results, ...game.playoffs].filter(
    (g) => g.homeTeamId === game.userTeamId || g.awayTeamId === game.userTeamId);
  const alive = game.playoffs.length === 0
    ? game.seeds.some((s) => s.teamId === game.userTeamId)
    : lastRoundSurvivor(game);
  const last = mine[mine.length - 1];
  const next = game.schedule.find((f) => f.week === game.week
    && (f.homeTeamId === game.userTeamId || f.awayTeamId === game.userTeamId));
  const name = (id: string): string => game.clubs.get(id)?.name ?? id;
  const nick = (id: string): string => game.clubs.get(id)?.nickname ?? id;
  const finish = done ? ranking(game.standings).findIndex((s) => s.teamId === game.userTeamId) + 1 : 0;
  const roster = squad(game, game.userTeamId);

  return (
    <>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <TeamMark
            abbreviation={game.userTeamId}
            primary={club?.primary ?? COLOR.line}
            secondary={club?.secondary ?? COLOR.mut}
            size={48}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: COLOR.tx, fontSize: 16, fontWeight: 600 }}>{club?.name ?? game.userTeamId}</div>
            <div style={{ color: COLOR.mut, fontSize: 12 }}>
              {record(standing)} · {roster.length} players
            </div>
          </div>
        </div>
      </Panel>

      <div style={{ marginTop: 10 }}>
        <StatTiles stats={[
          { label: 'Record', value: record(standing) },
          { label: 'Points for', value: String(standing?.pointsFor ?? 0) },
          { label: 'Against', value: String(standing?.pointsAgainst ?? 0) },
        ]}
        />
      </div>

      {game.abandoned.length > 0 && (
        <p
          data-testid="notice"
          style={{
            margin: '10px 0 0', padding: '8px 10px', borderRadius: 8,
            background: 'rgba(226,87,76,0.12)', border: `1px solid ${COLOR.red}`,
            color: COLOR.tx, fontSize: 12, lineHeight: 1.5,
          }}
        >
          {game.abandoned.length} game(s) could not be played: {game.abandoned.join(', ')}
        </p>
      )}

      <SectionHeader title={done ? 'Offseason' : inPlayoffs ? 'Playoffs' : 'Advance'} />
      <div style={{ display: 'grid', gap: 8 }}>
        {done ? (
          <>
            <p style={{ margin: '0 0 2px', color: COLOR.mut, fontSize: 13, lineHeight: 1.5 }}>
              {String(game.season)} is over. You finished <strong style={{ color: COLOR.tx }}>{record(standing)}</strong>,
              {' '}{ordinal(finish)} of {game.league.teamIds.length}.{' '}
              {champion === null ? '' : (
                <>Champions: <strong style={{ color: COLOR.amber }}>{nick(champion)}</strong>.</>
              )}
            </p>
            <ActionButton onClick={onOffseason} disabled={busy !== null} testId="next-season">
              {busy ?? `Run offseason → ${String(game.season + 1)}`}
            </ActionButton>
            <ActionButton onClick={onBracket} tone="quiet" testId="view-bracket">
              See the bracket
            </ActionButton>
            <ActionButton onClick={() => { open('recap', ''); }} tone="quiet" testId="view-recap">
              Season recap
            </ActionButton>
          </>
        ) : inPlayoffs ? (
          <>
            <p style={{ margin: '0 0 2px', color: COLOR.mut, fontSize: 13, lineHeight: 1.5 }}>
              {alive
                ? <>You are in the bracket. {roundLabel ?? 'The next round'} is next.</>
                : <>You did not make the fourteen. {roundLabel ?? 'The next round'} is next.</>}
            </p>
            <ActionButton onClick={onWeek} disabled={busy !== null} testId="sim-week">
              {busy ?? `Play the ${roundLabel ?? 'next round'}`}
            </ActionButton>
            <ActionButton onClick={onBracket} tone="quiet" testId="view-bracket">
              See the bracket
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton onClick={onWeek} disabled={busy !== null} testId="sim-week">
              {busy ?? `Sim week ${String(game.week)}`}
            </ActionButton>
            <ActionButton onClick={onSeason} disabled={busy !== null} tone="quiet" testId="sim-season">
              Sim to end of season
            </ActionButton>
          </>
        )}
      </div>

      <SectionHeader title={inPlayoffs ? 'This round' : 'This week'} />
      {next === undefined || inPlayoffs ? (
        <EmptyState
          title={done ? 'The season is over' : inPlayoffs
            ? (alive ? 'Waiting on the bracket' : 'Your season is over')
            : 'Bye week'}
          {...(done ? { detail: 'Run the offseason to start the next year.' } : {})}
          {...(inPlayoffs
            ? { detail: alive ? 'Play the round to see who you get.' : 'Play it out to see who takes it.' }
            : {})}
        />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            <ListRow
              title={next.homeTeamId === game.userTeamId
                ? `vs ${name(next.awayTeamId)}` : `at ${name(next.homeTeamId)}`}
              subtitle={`Week ${String(next.week)}`}
            />
          </div>
        </Panel>
      )}

      <SectionHeader title="Last result" />
      {last === undefined ? (
        <EmptyState title="No games played yet" detail="Sim a week to see a result here." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            <ListRow
              title={`${nick(last.awayTeamId)} ${String(last.awayScore)} — ${String(last.homeScore)} ${nick(last.homeTeamId)}`}
              subtitle={`${roundOf(last) ?? `Week ${String(last.week)}`}${last.overtime ? ' · OT' : ''}`}
              navigable
              onSelect={() => { open('game', last.gameId); }}
            />
          </div>
        </Panel>
      )}

      <SectionHeader title="Squad" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          {[...roster].sort((a, b) => b.ability - a.ability).slice(0, 5).map((p) => (
            <ListRow
              key={p.id}
              title={p.name}
              subtitle={`${p.group} · age ${String(Math.round(p.age))}`}
              trailing={<Caption>{String(Math.round(p.ability))}</Caption>}
              navigable
              onSelect={() => { open('player', p.id); }}
            />
          ))}
        </div>
      </Panel>
    </>
  );
}

/** The round's name when the game was a playoff game, else null. */
function roundOf(game: { readonly gameId: string }): string | null {
  const round = (game as { readonly round?: PlayoffRound }).round;
  return round === undefined ? null : ROUND_LABEL[round];
}

/** Whether the club you manage won its latest playoff game. */
function lastRoundSurvivor(game: Props['game']): boolean {
  const mine = game.playoffs.filter(
    (g) => g.homeTeamId === game.userTeamId || g.awayTeamId === game.userTeamId);
  const latest = mine[mine.length - 1];
  if (latest === undefined) return game.seeds.some((s) => s.teamId === game.userTeamId);
  return latest.homeTeamId === game.userTeamId
    ? latest.homeScore > latest.awayScore : latest.awayScore > latest.homeScore;
}

export function LeagueScreen(
  { game, open, conference, setConference }:
  Props & { conference: string; setConference: (key: string) => void },
) {
  const rows = ranking(game.standings).filter((s) => conference === 'all'
    || game.clubs.get(s.teamId)?.conferenceId === conference);
  const seedOf = new Map(game.seeds.map((s) => [s.teamId, s.seed]));
  const champion = game.seeds.length === 0 ? null : nextRound(game).champion;
  const totals = new Map<string, { pass: number; rush: number; rec: number }>();
  for (const g of game.results) {
    for (const line of g.players) {
      const t = totals.get(line.playerId) ?? { pass: 0, rush: 0, rec: 0 };
      t.pass += line.passYards; t.rush += line.rushYards; t.rec += line.receivingYards;
      totals.set(line.playerId, t);
    }
  }
  const byId = new Map(game.league.players.map((p) => [p.id, p]));
  const leader = (key: 'pass' | 'rush' | 'rec') => [...totals.entries()]
    .map(([id, t]) => ({ id, value: t[key], player: byId.get(id) }))
    .filter((e) => e.value > 0 && e.player !== undefined)
    .sort((a, b) => b.value - a.value)[0];

  const th = { textAlign: 'left' as const, color: COLOR.mut, fontSize: 11, padding: '6px 8px', whiteSpace: 'nowrap' as const };
  const td = { color: COLOR.tx, fontSize: 13, padding: '6px 8px', whiteSpace: 'nowrap' as const };

  return (
    <>
      <div style={{ marginTop: 8 }}>
        <ChipRow
          chips={[{ key: 'all', label: 'All' }, { key: 'AC', label: 'American' }, { key: 'NC', label: 'National' }]}
          value={conference}
          onChange={setConference}
          label="Conference"
        />
      </div>
      {game.seeds.length > 0 && (
        <>
          <SectionHeader title="Postseason" />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }}>
              <ListRow
                title={champion === null
                  ? 'The bracket is live'
                  : `${game.clubs.get(champion)?.name ?? champion} are champions`}
                subtitle={champion === null ? 'Fourteen clubs, four rounds' : String(game.season)}
                navigable
                onSelect={() => { open('playoffs', ''); }}
              />
            </div>
          </Panel>
        </>
      )}

      <SectionHeader title="Standings" />
      <Panel padded={false}>
        <div style={{ padding: 12 }}>
          <TableScroll>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Club</th><th style={th}>W-L</th><th style={th}>GP</th>
                  <th style={th}>PF</th><th style={th}>PA</th><th style={th}>Diff</th>
                  <th style={th}>Sd</th>
                </tr>
              </thead>
              <tbody data-testid="standings-body">
                {rows.map((s) => (
                  <tr key={s.teamId} style={{ borderTop: `1px solid ${COLOR.line}` }}>
                    <td style={{ ...td, color: s.teamId === game.userTeamId ? COLOR.amber : COLOR.tx }}>
                      {game.clubs.get(s.teamId)?.nickname ?? s.teamId}
                    </td>
                    <td style={td}>{record(s)}</td>
                    <td style={td}>{s.wins + s.losses + s.ties}</td>
                    <td style={td}>{s.pointsFor}</td>
                    <td style={td}>{s.pointsAgainst}</td>
                    <td style={td}>{s.pointsFor - s.pointsAgainst}</td>
                    <td style={{ ...td, color: seedOf.get(s.teamId) === undefined ? COLOR.dim : COLOR.amber }}>
                      {seedOf.get(s.teamId) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </Panel>

      <SectionHeader title="Leaders" />
      {game.results.length === 0 ? (
        <EmptyState title="No games played yet" detail="Leaders appear once a week has been simulated." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            {([['pass', 'Passing'], ['rush', 'Rushing'], ['rec', 'Receiving']] as const).map(([key, label]) => {
              const top = leader(key);
              if (top === undefined) return null;
              return (
                <ListRow
                  key={key}
                  title={top.player?.name ?? top.id}
                  subtitle={`${label} · ${top.player?.group ?? ''}`}
                  trailing={<span style={{ color: COLOR.amber, fontSize: 13 }}>{String(top.value)} yds</span>}
                  navigable
                  onSelect={() => { open('player', top.id); }}
                />
              );
            })}
          </div>
        </Panel>
      )}
    </>
  );
}

export function ScheduleScreen(
  { game, open, week, setWeek }: Props & { week: string; setWeek: (key: string) => void },
) {
  const shown = Number(week) || Math.min(game.week, game.weeks);
  const playoffWeeks = [...new Map(game.playoffs.map((g) => [g.week, g.round])).entries()]
    .sort((a, b) => a[0] - b[0]);
  const bracketWeek = playoffWeeks.find(([w]) => w === shown)?.[1];
  const fixtures = bracketWeek === undefined
    ? game.schedule.filter((f) => f.week === shown)
    : game.playoffs.filter((g) => g.week === shown)
      .map((g) => ({ week: g.week, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId }));
  const played = new Map([...game.results, ...game.playoffs].filter((g) => g.week === shown)
    .map((g) => [`${g.homeTeamId}|${g.awayTeamId}`, g]));
  const nick = (id: string): string => game.clubs.get(id)?.nickname ?? id;
  return (
    <>
      <div style={{ marginTop: 8 }}>
        <ChipRow
          chips={[
            ...Array.from({ length: game.weeks }, (_, i) => ({ key: String(i + 1), label: `Wk ${String(i + 1)}` })),
            ...playoffWeeks.map(([w, round]) => ({ key: String(w), label: ROUND_LABEL[round] })),
          ]}
          value={String(shown)}
          onChange={setWeek}
          label="Week"
        />
      </div>
      <SectionHeader title={bracketWeek === undefined ? `Week ${String(shown)}` : ROUND_LABEL[bracketWeek]} />
      {fixtures.length === 0 ? <EmptyState title="No fixtures this week" /> : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="fixture-list">
            {fixtures.map((f) => {
              const game_ = played.get(`${f.homeTeamId}|${f.awayTeamId}`);
              const mine = f.homeTeamId === game.userTeamId || f.awayTeamId === game.userTeamId;
              return (
                <ListRow
                  key={`${f.homeTeamId}-${f.awayTeamId}`}
                  title={`${nick(f.awayTeamId)} ${bracketWeek === 'LEAGUE_FINAL' ? 'v' : 'at'} ${nick(f.homeTeamId)}`}
                  {...(mine ? { subtitle: 'Your club' } : {})}
                  trailing={game_ === undefined
                    ? <span style={{ color: COLOR.dim, fontSize: 12 }}>—</span>
                    : <span style={{ color: COLOR.tx, fontSize: 13 }}>{game_.awayScore}–{game_.homeScore}</span>}
                  navigable={game_ !== undefined}
                  {...(game_ === undefined ? {} : { onSelect: () => { open('game', game_.gameId); } })}
                />
              );
            })}
          </div>
        </Panel>
      )}
    </>
  );
}

