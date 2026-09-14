// The franchise dashboard: the first screen after the world is built, and the
// one a manager opens every week.
//
// It answers, in this order, the questions somebody actually has on opening
// it: who am I, what am I rated, how is the season going, who do we play, what
// was I hired to do, what have I not done yet, and where is everything else.
// The one gold button on the page advances the week, because weekly management
// is the game; simulating a whole season is a quiet button on the Play tab and
// is meant to look like the shortcut it is.
//
// Everything on it comes from one read (reads/dashboard.ts) so the screen makes
// one round trip rather than six, and every figure it cannot get is drawn as a
// dash rather than a zero.

import { useState } from 'react';
import { COLOR, S } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Caption, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { TeamHero, type HeroTag } from '../components/TeamHero';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { RatingRow } from './ratingRing';
import { CardFigure, HubCard, HubStack, NotBuilt } from './hubCards';
import { PerformanceTiles, capLabel } from './dashboardCards';
import {
  ChecklistCard, OpponentSheet, OwnerCard, ThisWeekCard, type CheckItem,
} from './dashboardWeek';
import { mandateCopy } from './dashboardMandate';
import { Screen } from './Screen';
import type { DashboardOut } from '../../supabase/functions/_shared/api/reads/dashboard';

const recordOf = (r: DashboardOut['record']): string =>
  (r === null ? '—' : `${String(r.wins)}-${String(r.losses)}${r.ties > 0 ? `-${String(r.ties)}` : ''}`);

// A run of wins or losses, written the way a broadcast writes it. Zero is not
// a streak of nothing; it means no games played, and says so with a dash.
const streakOf = (r: DashboardOut['record']): string =>
  (r === null || r.streak === 0 ? '—' : `${r.streak > 0 ? 'W' : 'L'}${String(Math.abs(r.streak))}`);

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${String(n)}th`;
  return `${String(n)}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

export function TeamScreen() {
  const nav = useNavigator();
  const [sheet, setSheet] = useState(false);
  // Bumped by "Check again" on a save with no fixture list. It goes into the
  // query's version so the read actually runs again -- re-rendering the same
  // screen would leave the answer cached, and a button that looks like it
  // retried and did not is worse than no button.
  const [attempt, setAttempt] = useState(0);
  const {
    save, loaded, loadError, version, busy, notice, simWeek,
  } = useSave();
  const q = useQuery<DashboardOut>(
    'dashboard', { saveId: save?.saveId ?? '' }, version + attempt, save !== null);

  if (loadError !== null) return <Screen title="Team" screen="team"><QueryError error={loadError} /></Screen>;
  if (!loaded) return <Screen title="Team" screen="team"><Loading label="Loading dynasty" /></Screen>;
  if (save === null) return <Screen title="Team" screen="team"><NoDynasty /></Screen>;

  const d = q.status === 'ready' ? q.data : null;
  const done = d !== null && d.thisWeek.state === 'SEASON_OVER';
  const title = d?.identity.teamName ?? 'Team';
  // "Week 19 of 18" is what the plain form says once the bracket starts, so
  // the postseason names the round it is in instead of counting past the end
  // of the regular season.
  const subtitle = done && d !== null
    ? `${String(save.season)} · Season complete${d.rank === null ? '' : ` · ${ordinal(d.rank)} of ${String(d.teams)}`}`
    : save.phase === 'PLAYOFFS'
      ? `${String(save.season)} · ${d?.thisWeek.round ?? 'Playoffs'}`
      : `${String(save.season)} · Week ${String(save.week)} of ${String(save.weeks)}`;

  const tags: readonly HeroTag[] = d === null ? [] : [
    ...(d.status === null ? [] : [{ label: d.status, kind: 'status' }]),
    ...(mandateCopy(d.owner?.mandate ?? null) === null
      ? []
      : [{ label: mandateCopy(d.owner?.mandate ?? null)?.label ?? '', kind: 'mandate', accent: true as const }]),
  ];

  const checklist = (data: DashboardOut): readonly CheckItem[] => [
    {
      key: 'roster',
      title: 'Review the roster',
      detail: `${String(data.shape.rosterCount)} players under contract`,
      state: data.shape.rosterCount >= 53 ? 'ready' : 'attention',
      onSelect: () => { nav.push('roster'); },
    },
    {
      key: 'depth',
      title: 'Set the depth chart',
      detail: data.shape.depthStarters >= data.shape.positionGroups
        ? `A starter named in all ${String(data.shape.positionGroups)} groups`
        : `${String(data.shape.depthStarters)} of ${String(data.shape.positionGroups)} groups have a starter`,
      state: data.shape.depthStarters >= data.shape.positionGroups ? 'ready' : 'attention',
      onSelect: () => { nav.push('roster'); },
    },
    {
      key: 'cap',
      title: 'Check cap space',
      detail: data.capSpace === null
        ? 'No cap sheet for this season'
        : data.capSpace < 0
          ? `${capLabel(data.capSpace)} over the ceiling`
          : `${capLabel(data.capSpace)} available · Office tab`,
      state: data.capSpace === null ? 'open' : data.capSpace < 0 ? 'attention' : 'ready',
      onSelect: () => { nav.replaceRoot('office'); },
    },
    {
      key: 'opponent',
      title: 'View the opponent',
      detail: data.thisWeek.opponentName ?? 'No game scheduled this week',
      state: 'open',
      onSelect: () => { setSheet(true); },
    },
    {
      key: 'sim',
      title: 'Play the game',
      detail: data.shape.played > 0
        ? `${String(data.shape.played)} games played across the league`
        : 'Nothing has been played yet',
      state: 'open',
      onSelect: () => { nav.replaceRoot('play'); },
    },
  ];

  return (
    <Screen title={title} subtitle={subtitle} screen="team">
      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && <Loading label="Loading the franchise" rows={8} />}
      {d !== null && (
        <>
          {notice !== null && <Caption>{notice}</Caption>}

          <TeamHero
            abbreviation={d.identity.teamId}
            metro={d.identity.city}
            nickname={d.identity.teamName}
            primary={d.identity.primary === '' ? COLOR.line2 : d.identity.primary}
            secondary={d.identity.secondary === '' ? COLOR.mut : d.identity.secondary}
            record={recordOf(d.record)}
            recordLabel={done ? 'Final record' : 'Record'}
            tags={tags}
            facts={[
              {
                label: 'Division',
                value: d.identity.divisionShort === ''
                  ? '—'
                  : `${d.identity.conferenceName.replace(' Conference', '')} ${d.identity.divisionShort}`,
              },
              { label: 'Roster', value: `${String(d.shape.rosterCount)} players` },
              { label: 'Streak', value: streakOf(d.record) },
              { label: 'Cap space', value: capLabel(d.capSpace) },
            ]}
          />

          <SectionHeader title="Team rating" />
          <Panel>
            <RatingRow
              ratings={[
                { label: 'Overall', rating: d.ratings.overall, band: d.ratings.overallBand },
                { label: 'Offense', rating: d.ratings.offense, band: d.ratings.offenseBand },
                { label: 'Defense', rating: d.ratings.defense, band: d.ratings.defenseBand },
                { label: 'Special teams', rating: d.ratings.specialTeams, band: d.ratings.specialTeamsBand },
              ]}
            />
          </Panel>

          <SectionHeader title="Season" />
          <PerformanceTiles
            pointsFor={d.record?.pointsFor ?? null}
            pointsAgainst={d.record?.pointsAgainst ?? null}
            differential={d.record?.differential ?? null}
            turnovers={d.turnovers?.differential ?? null}
            rank={d.rank}
            teams={d.teams}
            played={d.record?.played ?? 0}
          />

          <div style={{ display: 'grid', gap: S[3], marginTop: S[4], minWidth: 0 }}>
            <ThisWeekCard
              week={d.thisWeek}
              weeks={save.weeks}
              busy={busy}
              onSim={() => {
                if (d.thisWeek.state === 'SEASON_OVER') { nav.replaceRoot('play'); return; }
                void simWeek();
              }}
              onPreview={() => { setSheet(true); }}
              onDepthChart={() => { nav.push('roster'); }}
              onRecheck={() => { setAttempt((n) => n + 1); }}
            />
            <OwnerCard owner={d.owner} />
            <ChecklistCard
              title={d.shape.played === 0 ? 'Before week 1' : 'This week’s checklist'}
              items={checklist(d)}
            />
          </div>

          <SectionHeader title="Football operations" />
          <HubStack>
            <HubCard
              title="Depth chart"
              detail="Who plays ahead of whom, position by position"
              trailing={<CardFigure value={String(d.shape.rosterCount)} />}
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
                put the three above it in doubt. */}
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
            <NotBuilt
              title="Transaction log"
              detail="Every signing, release and trade this dynasty has made."
              testId="soon-transactions"
            />
          </HubStack>

          <SectionHeader title="Roster" />
          <Panel padded={false}>
            <div style={{ padding: `0 ${String(S[3])}px` }} data-testid="roster-list">
              {d.squad.map((p) => (
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

      {sheet && <OpponentSheet onClose={() => { setSheet(false); }} />}
    </Screen>
  );
}
