// The franchise dashboard, in the play-test build.
//
// Same components as the app -- the hero, the rating rings, the season tiles,
// the week card, the owner card and the checklist all come out of src/ -- and
// the same derivations, which are pure functions on the server's side of the
// wire and are imported rather than copied. What differs is where the numbers
// come from: the app reads reads/dashboard.ts, and this assembles the same
// shape out of the league sitting in the page.
//
// Assembling that shape rather than a looser one of its own is the point. If
// the rig and the app disagree about what a dashboard is made of, the rig has
// stopped being a way to play the game and become a second game.

import { useState } from 'react';
import { COLOR, S } from '../../src/app/tokens';
import { TeamHero, type HeroTag } from '../../src/components/TeamHero';
import { Panel, SectionHeader } from '../../src/components/Surface';
import { RatingRow } from '../../src/screens/ratingRing';
import { PerformanceTiles, capLabel } from '../../src/screens/dashboardCards';
import { ChecklistSheet, OwnerCard, ThisWeekCard } from '../../src/screens/dashboardWeek';
import { ChecklistCard, stateOf } from '../../src/screens/checklistCard';
import { CHECKLIST_COPY, CHECKLIST_SHEETS } from '../../src/screens/checklistCatalogue';
import {
  markChecklist as mergeMark,
  type ChecklistItem, type ChecklistProgress,
} from '../../supabase/functions/_shared/api/checklist.ts';
import { mandateCopy } from '../../src/screens/dashboardMandate';
import {
  matchupDifficulty, mandateStanding, overallRating, ownerMandate, ownerMood,
  quarterbackSituation, ratingBand, rosterTimeline,
} from '../../supabase/functions/_shared/api/reads/teamOutlook.ts';
import { ON_FIELD } from '../../supabase/functions/_shared/api/reads/teamBoard.ts';
import { TeamScreen } from './screens';
import { capFor, ranking, squad, type Game } from './host';
import { conferences, divisions, owners } from './world';
import { isWinter } from './winter';
import { record, type ScreenProps as Props } from './common';
import type { DashboardOut } from '../../supabase/functions/_shared/api/reads/dashboard.ts';

// The live league groups players by the engine's position codes rather than
// by the seed's room names, so the sides are named in those. Same three sides
// the server's query splits on, same starter counts.
const OFFENCE = new Set<string>(['QB', 'RB', 'WR', 'TE', 'OL']);
const DEFENCE = new Set<string>(['EDGE', 'DT', 'LB', 'CB', 'S']);

const mean = (xs: readonly number[], take: number): number | null => {
  const top = [...xs].sort((a, b) => b - a).slice(0, take);
  return top.length === 0 ? null : Math.round((top.reduce((a, b) => a + b, 0) / top.length) * 10) / 10;
};

/** The three units, off the roster as it is now rather than as it shipped. */
function ratingsOf(game: Game, teamId: string) {
  const roster = game.league.players.filter((p) => p.teamId === teamId);
  const by = (keep: (group: string) => boolean): number[] =>
    roster.filter((p) => keep(p.group)).map((p) => p.ability);
  const offense = mean(by((g) => OFFENCE.has(g)), ON_FIELD.offence);
  const defense = mean(by((g) => DEFENCE.has(g)), ON_FIELD.defence);
  const specialTeams = mean(by((g) => !OFFENCE.has(g) && !DEFENCE.has(g)), ON_FIELD.special);
  return { offense, defense, specialTeams, overall: overallRating(offense, defense, specialTeams) };
}

/** Turnovers given and taken this season, from the box scores themselves. */
function turnoversOf(game: Game, teamId: string): DashboardOut['turnovers'] {
  const mine = game.results.filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId);
  if (mine.length === 0) return null;
  let given = 0;
  let taken = 0;
  for (const g of mine) {
    const home = g.homeTeamId === teamId;
    given += (home ? g.home : g.away).turnovers;
    taken += (home ? g.away : g.home).turnovers;
  }
  return { taken, given, differential: taken - given };
}

export function DashboardScreen(
  { game, open, busy, onSim, checklist, onMark }:
  Props & {
    busy: string | null; onSim: () => void;
    checklist: ChecklistProgress;
    onMark: (item: ChecklistItem) => void;
  },
) {
  const [sheet, setSheet] = useState<ChecklistItem | null>(null);
  const teamId = game.userTeamId;
  const club = game.clubs.get(teamId);
  const standing = game.standings.get(teamId);
  const played = standing === undefined ? 0 : standing.wins + standing.losses + standing.ties;
  const done = isWinter(game.phase);
  const roster = squad(game, teamId);
  const rated = ratingsOf(game, teamId);
  const cap = capFor(game, teamId);
  const owner = owners().get(teamId);
  const place = ranking(game.standings).findIndex((s) => s.teamId === teamId) + 1;
  const ages = game.league.players.filter((p) => p.teamId === teamId).map((p) => p.age);
  const averageAge = ages.length === 0
    ? null
    : Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10;
  const passers = game.league.players
    .filter((p) => p.teamId === teamId && p.group === 'QB')
    .sort((a, b) => b.ability - a.ability);
  const quarterback = quarterbackSituation(
    passers[0]?.ability ?? null,
    passers[0]?.age === undefined ? null : Math.round(passers[0].age),
    passers[1]?.ability ?? null);

  const conferenceName = conferences().find((c) => c.id === club?.conferenceId)?.name ?? '';
  const divisionName = divisions().find((d) => d.id === club?.divisionId)?.name ?? '';
  const patience = owner?.['patience'] === undefined ? null : Number(owner['patience']);
  const mandate = ownerMandate({
    patience,
    winNowBias: owner?.['win_now_bias'] === undefined ? null : Number(owner['win_now_bias']),
    overall: rated.overall,
    averageAge,
    capSpace: cap.available,
    quarterback,
  });

  const fixture = game.schedule.find((f) => f.week === game.week
    && (f.homeTeamId === teamId || f.awayTeamId === teamId));
  const opponentId = fixture === undefined
    ? null
    : fixture.homeTeamId === teamId ? fixture.awayTeamId : fixture.homeTeamId;
  const opponentRated = opponentId === null
    ? { overall: null } : ratingsOf(game, opponentId);
  const opponentStanding = opponentId === null ? undefined : game.standings.get(opponentId);

  const week: DashboardOut['thisWeek'] = {
    state: fixture !== undefined
      ? 'FIXTURE'
      : done ? 'SEASON_OVER' : game.schedule.length === 0 ? 'NO_SCHEDULE' : 'BYE',
    week: game.week,
    // The rig's fixtures are not identified until they are played, so there
    // is no game to link to before kick-off. Reported as none, not invented.
    gameId: null,
    opponentId,
    opponentName: opponentId === null ? null : game.clubs.get(opponentId)?.name ?? opponentId,
    opponentRecord: opponentStanding === undefined ? null : {
      wins: opponentStanding.wins, losses: opponentStanding.losses, ties: opponentStanding.ties,
    },
    opponentOverall: opponentRated.overall,
    opponentBand: ratingBand(opponentRated.overall),
    home: fixture === undefined ? null : fixture.homeTeamId === teamId,
    difficulty: matchupDifficulty(rated.overall, opponentRated.overall),
    round: null,
  };

  const status = rosterTimeline({
    offense: rated.offense, defense: rated.defense, overall: rated.overall,
    averageAge, capSpace: cap.available, draft: null, quarterback,
    weakest: null, weakestBehind: null,
  });
  const goal = mandateCopy(mandate);
  const tags: readonly HeroTag[] = [
    ...(status === null ? [] : [{ label: status, kind: 'status' }]),
    ...(goal === null ? [] : [{ label: goal.label, kind: 'mandate', accent: true as const }]),
  ];
  const turnovers = turnoversOf(game, teamId);

  return (
    <>
      <TeamHero
        abbreviation={teamId}
        metro={club?.metro ?? ''}
        nickname={club?.nickname ?? teamId}
        primary={club?.primary ?? COLOR.line2}
        secondary={club?.secondary ?? COLOR.mut}
        record={record(standing)}
        recordLabel={done ? 'Final record' : 'Record'}
        tags={tags}
        facts={[
          {
            label: 'Division',
            value: divisionName === ''
              ? '—'
              : `${conferenceName.replace(' Conference', '')} ${divisionName.replace(`${club?.conferenceId ?? ''} `, '')}`,
          },
          { label: 'Roster', value: `${String(roster.length)} players` },
          {
            label: 'Streak',
            value: standing === undefined || standing.streak === 0
              ? '—'
              : `${standing.streak > 0 ? 'W' : 'L'}${String(Math.abs(standing.streak))}`,
          },
          { label: 'Cap space', value: capLabel(cap.available) },
        ]}
      />

      <SectionHeader title="Team rating" />
      <Panel>
        <RatingRow
          ratings={[
            { label: 'Overall', rating: rated.overall, band: ratingBand(rated.overall) },
            { label: 'Offense', rating: rated.offense, band: ratingBand(rated.offense) },
            { label: 'Defense', rating: rated.defense, band: ratingBand(rated.defense) },
            { label: 'Special teams', rating: rated.specialTeams, band: ratingBand(rated.specialTeams) },
          ]}
        />
      </Panel>

      <SectionHeader title="Season" />
      <PerformanceTiles
        pointsFor={standing?.pointsFor ?? null}
        pointsAgainst={standing?.pointsAgainst ?? null}
        differential={standing === undefined ? null : standing.pointsFor - standing.pointsAgainst}
        turnovers={turnovers?.differential ?? null}
        // Before anybody has played, every club is level and the order is only
        // the tie-break, so no position is reported at all.
        rank={played === 0 || place === 0 ? null : place}
        teams={game.league.teamIds.length}
        played={played}
      />

      <div style={{ display: 'grid', gap: S[3], marginTop: S[4], minWidth: 0 }}>
        <ThisWeekCard
          week={week}
          weeks={game.weeks}
          busy={busy}
          onSim={onSim}
          onPreview={() => { onMark('opponent'); setSheet('opponent'); }}
          onDepthChart={() => { open('roster', ''); }}
          onRecheck={() => { open('schedule', ''); }}
        />
        <OwnerCard
          owner={owner === undefined ? null : {
            name: owner['owner_name'] ?? 'The owner',
            archetype: owner['archetype'] ?? null,
            tenureYears: null,
            patience,
            mood: ownerMood(patience),
            mandate,
            standing: standing === undefined
              ? null
              : mandateStanding(mandate, standing.wins, standing.losses, standing.ties),
          }}
        />
        <ChecklistCard
          rows={CHECKLIST_COPY.map((c) => ({
            key: c.key,
            title: c.title,
            detail: c.key === 'roster'
              ? `${String(roster.length)} players under contract`
              : c.key === 'cap'
                ? `${capLabel(cap.available)} available`
                : c.key === 'opponent'
                  ? week.opponentName ?? 'No game scheduled this week'
                  : c.detail,
            state: stateOf(checklist, c.key, c.key === 'sim' && played > 0),
            onSelect: () => {
              onMark(c.key);
              if (c.key === 'roster' || c.key === 'depth') { open('roster', ''); return; }
              if (c.key === 'cap' || c.key === 'opponent') { setSheet(c.key); return; }
              onSim();
            },
          }))}
          opening={played === 0}
          note={'A tick means the save holds the rows it describes, or the week has '
            + 'been played. The app does not record what you have read.'}
        />
      </div>

      {sheet !== null && CHECKLIST_SHEETS[sheet] !== undefined && (
        <ChecklistSheet
          copy={CHECKLIST_SHEETS[sheet]}
          onClose={() => { setSheet(null); }}
          {...(sheet === 'cap' ? { onAction: () => { open('office', ''); } } : {})}
        />
      )}
    </>
  );
}

/**
 * The whole Team tab: the dashboard, and the lists that sit under it.
 *
 * The checklist marks live here rather than in the file, because the rig has
 * no server to keep them and a browser refresh reloads the save from storage
 * anyway. The app's marks are on the save; these last as long as the dynasty
 * is open, which is the honest most this build can offer -- and the merge rule
 * is the shared one, so neither build can invent its own.
 */
export function TeamTab(
  { game, open, busy, onSim }: Props & { busy: string | null; onSim: () => void },
) {
  const [checklist, setChecklist] = useState<ChecklistProgress>({});
  return (
    <>
      <DashboardScreen
        game={game}
        open={open}
        busy={busy}
        onSim={onSim}
        checklist={checklist}
        onMark={(item) => { setChecklist((held) => mergeMark(held, item, 'VIEWED')); }}
      />
      <TeamScreen game={game} open={open} />
    </>
  );
}
