// Team: football operations.
//
// Who you are and what the roster looks like -- the record, the differential,
// the squad, and the way into every list that is about players rather than
// about the league or the week. The button that advances the game used to sit
// here, under a hero and a roster list, which put the most-used control in the
// product below the fold on a phone; it is its own tab now.

import { COLOR, S } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Caption, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { TeamHero } from '../components/TeamHero';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { isOffseasonPhase } from '../domain/phase';
import { CardFigure, HubCard, HubStack, NotBuilt } from './hubCards';
import { Screen } from './Screen';
import type { TeamOut } from '../../supabase/functions/_shared/api/reads/team';
import type { PlayoffsOut } from '../../supabase/functions/_shared/api/reads/playoffs';

const recordOf = (s: { wins: number; losses: number; ties: number } | null): string =>
  s === null ? '—' : `${String(s.wins)}-${String(s.losses)}${s.ties > 0 ? `-${String(s.ties)}` : ''}`;

// A run of wins or losses, written the way a broadcast writes it. Zero is not
// a streak of nothing; it means no games played, and says so with a dash.
const streakOf = (s: { streak: number } | null): string =>
  s === null || s.streak === 0 ? '—' : `${s.streak > 0 ? 'W' : 'L'}${String(Math.abs(s.streak))}`;

const signed = (n: number): string => (n > 0 ? `+${String(n)}` : String(n));

export function TeamScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, clubsById, version } = useSave();
  const q = useQuery<TeamOut>('team', { saveId: save?.saveId ?? '' }, version, save !== null);
  // The bracket is only asked for once there is one: through the regular
  // season this stays unfetched.
  const post = useQuery<PlayoffsOut>(
    'playoffs', { saveId: save?.saveId ?? '' }, version,
    save !== null && save.phase !== 'REGULAR_SEASON');

  if (loadError !== null) return <Screen title="Team" screen="team"><QueryError error={loadError} /></Screen>;
  if (!loaded) return <Screen title="Team" screen="team"><Loading label="Loading dynasty" /></Screen>;
  if (save === null) return <Screen title="Team" screen="team"><NoDynasty /></Screen>;

  const identity = clubsById.get(save.userTeamId);
  const done = isOffseasonPhase(save.phase);
  const inPlayoffs = save.phase === 'PLAYOFFS';
  const roundLabel = post.status === 'ready' ? post.data.nextLabel : null;
  const ordinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${String(n)}${s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th'}`;
  };

  return (
    <Screen
      title={identity?.nickname ?? 'Team'}
      subtitle={`${String(save.season)} · ${done
        ? `Season complete${q.status === 'ready' && q.data.rank !== null ? ` · finished ${ordinal(q.data.rank)} of 32` : ''}`
        : inPlayoffs
          ? (roundLabel ?? 'Playoffs')
          : `Week ${String(save.week)} of ${String(save.weeks)}`}`}
      screen="team"
    >
      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && <Loading label="Loading team" />}
      {q.status === 'ready' && (
        <>
          <TeamHero
            abbreviation={save.userTeamId}
            metro={identity?.metro ?? ''}
            nickname={identity?.nickname ?? save.userTeamId}
            primary={identity?.primary ?? COLOR.line2}
            secondary={identity?.secondary ?? COLOR.mut}
            record={recordOf(q.data.standing)}
            recordLabel={done ? 'Final record' : 'Record'}
            facts={[
              { label: 'League', value: q.data.rank === null ? '—' : `${ordinal(q.data.rank)} of 32` },
              { label: 'Streak', value: streakOf(q.data.standing) },
              { label: 'Roster', value: `${String(q.data.squadSize)} players` },
            ]}
          />

          <div style={{ marginTop: S[2] }}>
            <StatTiles
              stats={[
                { label: 'Points for', value: q.data.standing === null ? '—' : String(q.data.standing.pointsFor) },
                { label: 'Against', value: q.data.standing === null ? '—' : String(q.data.standing.pointsAgainst) },
                {
                  label: 'Point diff',
                  value: q.data.standing === null ? '—' : signed(q.data.standing.pointsFor - q.data.standing.pointsAgainst),
                  tone: q.data.standing === null || q.data.standing.pointsFor === q.data.standing.pointsAgainst
                    ? 'default'
                    : q.data.standing.pointsFor > q.data.standing.pointsAgainst ? 'positive' : 'negative',
                },
              ]}
            />
          </div>

          <SectionHeader title="Football operations" />
          <HubStack>
            <HubCard
              title="Depth chart"
              detail="Who plays ahead of whom, position by position"
              trailing={<CardFigure value={String(q.data.squadSize)} />}
              onSelect={() => { nav.push('roster'); }}
              testId="to-roster"
            />
            <HubCard
              title="Schedule"
              detail="Your season, fixture by fixture"
              onSelect={() => { nav.push('schedule'); }}
              testId="to-schedule"
            />
            <HubCard
              title="Offseason moves"
              detail="Re-signings, free agency, the draft and trades"
              onSelect={() => { nav.push('offseason'); }}
              testId="to-offseason"
            />
            {/* Named because the tab promises them and dimmed because they do
                not exist. A card that looked tappable and did nothing would
                put the five above it in doubt. */}
            <NotBuilt
              title="Contracts"
              detail="What every player is owed, and for how long."
              testId="soon-contracts"
            />
            <NotBuilt
              title="Injuries"
              detail="Who is out, with what, and for how many weeks."
              testId="soon-injuries"
            />
            <NotBuilt
              title="Practice squad and training"
              detail="Develop the players who are not starting yet."
              testId="soon-training"
            />
            {/* The table is written every time the dynasty signs, releases or
                trades anyone; nothing reads it back yet, so this says so
                rather than opening a screen that would load forever. */}
            <NotBuilt
              title="Transaction log"
              detail="Every signing, release and trade this dynasty has made."
              testId="soon-transactions"
            />
          </HubStack>

          <SectionHeader title="Roster" />
          <Panel padded={false}>
            <div style={{ padding: `0 ${String(S[3])}px` }} data-testid="roster-list">
              {q.data.squad.map((p) => (
                <ListRow
                  key={p.playerId}
                  title={p.name}
                  subtitle={`${p.group} · age ${String(p.age)}`}
                  trailing={<Caption>{String(p.overall)}</Caption>}
                  navigable
                  onSelect={() => { nav.push('player', { id: p.playerId }); }}
                />
              ))}
            </div>
          </Panel>
        </>
      )}
    </Screen>
  );
}
