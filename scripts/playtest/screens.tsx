// Team, League and Schedule, in the play-test build. Same components and
// tokens as the app. Play is next door in play.tsx, for the same reason the
// app has a Play tab: the week and the roster are two different jobs.

import { COLOR, S } from '../../src/app/tokens';
import { Caption, EmptyState, Panel, SectionHeader } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { StatTiles } from '../../src/components/StatTiles';
import { TeamHero } from '../../src/components/TeamHero';
import { ChipRow } from '../../src/components/ChipRow';
import { ranking, squad } from './host';
import { boardsFor, leagueGroups, tableFor } from './leaders';
import { CompetitionToggle } from '../../src/components/CompetitionToggle';
import { COMPETITION_PARAM, type Competition } from '../../src/domain/competition';
import {
  DEFAULT_SORT, LEAGUE_ORDER, LeadersPanel, SPLIT_CHIPS, StandingsPanel,
  type Sort, type Split,
} from '../../src/screens/leaguePanels';
import { nextRound, ROUND_LABEL, type PlayoffRound } from './postseason';
import { ordinal, record, type ScreenProps as Props } from './common';


/** A run of wins or losses, written the way a broadcast writes it. */
const streakOf = (s: { streak: number } | undefined): string =>
  s === undefined || s.streak === 0 ? '—' : `${s.streak > 0 ? 'W' : 'L'}${String(Math.abs(s.streak))}`;

const signed = (n: number): string => (n > 0 ? `+${String(n)}` : String(n));

export function TeamScreen({ game, open }: Props) {
  const club = game.clubs.get(game.userTeamId);
  const standing = game.standings.get(game.userTeamId);
  const done = game.phase === 'OFFSEASON';
  const place = ranking(game.standings).findIndex((s) => s.teamId === game.userTeamId) + 1;
  const played = standing === undefined ? 0 : standing.wins + standing.losses + standing.ties;
  const roster = squad(game, game.userTeamId);

  return (
    <>
      <TeamHero
        abbreviation={game.userTeamId}
        metro={club?.metro ?? ''}
        nickname={club?.nickname ?? game.userTeamId}
        primary={club?.primary ?? COLOR.line2}
        secondary={club?.secondary ?? COLOR.mut}
        record={record(standing)}
        recordLabel={done ? 'Final record' : 'Record'}
        facts={[
          // Before anybody has played, every team is 0-0 and the "order" is
          // only the tie-break. A position nobody has earned is not a fact
          // (ARCHITECTURE.md rule 3), so it reports a dash instead.
          { label: 'League', value: played === 0 || place === 0
            ? '—'
            : `${ordinal(place)} of ${String(game.league.teamIds.length)}` },
          { label: 'Streak', value: streakOf(standing) },
          { label: 'Roster', value: `${String(roster.length)} players` },
        ]}
      />

      <div style={{ marginTop: S[2] }}>
        <StatTiles stats={[
          { label: 'Points for', value: String(standing?.pointsFor ?? 0) },
          { label: 'Against', value: String(standing?.pointsAgainst ?? 0) },
          {
            label: 'Point diff',
            value: signed((standing?.pointsFor ?? 0) - (standing?.pointsAgainst ?? 0)),
            tone: (standing?.pointsFor ?? 0) === (standing?.pointsAgainst ?? 0)
              ? 'default'
              : (standing?.pointsFor ?? 0) > (standing?.pointsAgainst ?? 0) ? 'positive' : 'negative',
          },
        ]}
        />
      </div>

      <SectionHeader title="Football operations" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          <ListRow
            title="Depth chart"
            subtitle="Who plays ahead of whom, position by position"
            trailing={<Caption>{String(roster.length)}</Caption>}
            navigable
            onSelect={() => { open('roster', ''); }}
          />
          <ListRow
            title="Schedule"
            subtitle="Your season, fixture by fixture"
            navigable
            onSelect={() => { open('schedule', ''); }}
          />
        </div>
      </Panel>

      <SectionHeader title="Roster" />
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
export function roundOf(game: { readonly gameId: string }): string | null {
  const round = (game as { readonly round?: PlayoffRound }).round;
  return round === undefined ? null : ROUND_LABEL[round];
}

/** Whether the club you manage won its latest playoff game. */
export function lastRoundSurvivor(game: Props['game']): boolean {
  const mine = game.playoffs.filter(
    (g) => g.homeTeamId === game.userTeamId || g.awayTeamId === game.userTeamId);
  const latest = mine[mine.length - 1];
  if (latest === undefined) return game.seeds.some((s) => s.teamId === game.userTeamId);
  return latest.homeTeamId === game.userTeamId
    ? latest.homeScore > latest.awayScore : latest.awayScore > latest.homeScore;
}

export function LeagueScreen(
  { game, open, ui, setUi }:
  Props & { ui: Readonly<Record<string, string>>; setUi: (key: string, value: string) => void },
) {
  // The same two panels the product renders, from the same shapes: the rig
  // builds what the league read returns instead of asking a server for it.
  const competition: Competition = ui['leaderComp'] === 'PLAYOFFS' ? 'PLAYOFFS' : 'REGULAR_SEASON';
  const rows = tableFor(game);
  const groups = leagueGroups();
  const boards = boardsFor(game, COMPETITION_PARAM[competition]);
  const played = competition === 'PLAYOFFS' ? game.playoffs.length : game.results.length;
  const sortKey = ui['leagueSort'] ?? '';
  const sort: Sort = sortKey === ''
    ? DEFAULT_SORT
    : { key: sortKey.slice(1) as Sort['key'], dir: sortKey.startsWith('-') ? 'desc' : 'asc' };
  const champion = game.seeds.length === 0 ? null : nextRound(game).champion;
  const nameOf = (id: string): string => game.clubs.get(id)?.nickname ?? id;

  return (
    <>
      {game.seeds.length > 0 && (
        <>
          <SectionHeader title="Postseason" />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }}>
              <ListRow
                title={champion === null
                  ? 'The bracket is live'
                  : `${game.clubs.get(champion)?.name ?? champion} are champions`}
                subtitle={champion === null ? 'Fourteen teams, four rounds' : String(game.season)}
                navigable
                onSelect={() => { open('playoffs', ''); }}
              />
            </div>
          </Panel>
        </>
      )}

      <SectionHeader title="Standings" />
      <div style={{ marginBottom: 8 }}>
        <ChipRow
          chips={SPLIT_CHIPS}
          value={ui['leagueSplit'] ?? 'CONFERENCE'}
          onChange={(key) => { setUi('leagueSplit', key); }}
          label="Standings split"
        />
      </div>
      <StandingsPanel
        rows={rows}
        conferences={groups.conferences}
        divisions={groups.divisions}
        split={(ui['leagueSplit'] ?? 'CONFERENCE') as Split}
        sort={sort}
        onSort={(next) => {
          setUi('leagueSort', next.key === LEAGUE_ORDER ? '' : `${next.dir === 'desc' ? '-' : '+'}${next.key}`);
        }}
        userTeamId={game.userTeamId}
        nameOf={nameOf}
      />

      <SectionHeader title="Leaders" />
      <div style={{ marginBottom: 8 }}>
        <CompetitionToggle
          value={competition}
          onChange={(c) => { setUi('leaderComp', c); }}
        />
      </div>
      {played === 0 ? (
        <EmptyState
          title="No games played yet"
          detail={competition === 'PLAYOFFS'
            ? 'Leaders appear once the bracket has been played.'
            : 'Leaders appear once a week has been simulated.'}
        />
      ) : (
        <LeadersPanel
          boards={boards}
          boardKey={ui['leaderBoard'] ?? 'passYards'}
          onBoard={(key) => { setUi('leaderBoard', key); }}
          side={ui['leaderSide'] ?? 'OFFENSE'}
          onSide={(next) => { setUi('leaderSide', next); }}
          nameOf={nameOf}
          onSelect={(playerId) => { open('player', playerId); }}
        />
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
      {fixtures.length === 0 ? <EmptyState title="No games this week" /> : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="fixture-list">
            {fixtures.map((f) => {
              const game_ = played.get(`${f.homeTeamId}|${f.awayTeamId}`);
              const mine = f.homeTeamId === game.userTeamId || f.awayTeamId === game.userTeamId;
              return (
                <ListRow
                  key={`${f.homeTeamId}-${f.awayTeamId}`}
                  title={`${nick(f.awayTeamId)} ${bracketWeek === 'LEAGUE_FINAL' ? 'v' : 'at'} ${nick(f.homeTeamId)}`}
                  {...(mine ? { subtitle: 'Your team' } : {})}
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

