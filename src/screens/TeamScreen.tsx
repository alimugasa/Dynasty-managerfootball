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

import { useRef, useState } from 'react';
import { COLOR, S } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Caption, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { PlayerFace } from '../avatar/PlayerFace';
import { useAvatars } from '../hooks/useAvatars';
import { TeamHero, type HeroTag } from '../components/TeamHero';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { RatingRow } from './ratingRing';
import { CardFigure, HubCard, HubStack, NotBuilt } from './hubCards';
import { PerformanceTiles, capLabel } from './dashboardCards';
import { StatTiles } from '../components/StatTiles';
import { ChecklistSheet, OwnerCard, ThisWeekCard } from './dashboardWeek';
import { ChecklistCard, stateOf, type ChecklistRow } from './checklistCard';
import { CHECKLIST_COPY, CHECKLIST_SHEETS } from './checklistCatalogue';
import type { ChecklistItem } from '../../supabase/functions/_shared/api/checklist';
import { mandateCopy } from './dashboardMandate';
import { divisionShort } from '../../supabase/functions/_shared/api/leaguePlacing';
import { Screen } from './Screen';
import { isCampPhase, PHASE_LABEL } from '../domain/phase';
import { CampEntry } from './camp/CampEntry';
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

/** Stable across renders while the dashboard read is in flight. */
const NO_IDS: readonly string[] = [];

export function TeamScreen() {
  const nav = useNavigator();
  /** Which placeholder is open, or null. Named rather than boolean now that
   *  more than one row can raise one. */
  const [sheet, setSheet] = useState<ChecklistItem | null>(null);
  // Bumped by "Check again" on a save with no fixture list. It goes into the
  // query's version so the read actually runs again -- re-rendering the same
  // screen would leave the answer cached, and a button that looks like it
  // retried and did not is worse than no button.
  const [attempt, setAttempt] = useState(0);
  /** The week card, so the last checklist row can put the manager in front of
   *  the button rather than navigating them somewhere to look for one. */
  const week = useRef<HTMLDivElement>(null);
  const {
    save, loaded, loadError, version, busy, notice, simWeek,
    checklist, markChecklist,
  } = useSave();
  const q = useQuery<DashboardOut>(
    'dashboard', { saveId: save?.saveId ?? '' }, version + attempt, save !== null);
  // Above the early returns, and keyed on the squad the dashboard read
  // returned rather than on a fresh array each render.
  const faces = useAvatars(
    q.status === 'ready' ? q.data.squad.map((p) => p.playerId) : NO_IDS,
  );

  if (loadError !== null) return <Screen title="Team" screen="team"><QueryError error={loadError} /></Screen>;
  if (!loaded) return <Screen title="Team" screen="team"><Loading label="Loading dynasty" /></Screen>;
  if (save === null) return <Screen title="Team" screen="team"><NoDynasty /></Screen>;

  const d = q.status === 'ready' ? q.data : null;
  const done = d !== null && d.thisWeek.state === 'SEASON_OVER';
  const title = d?.identity.teamName ?? 'Team';
  // "Week 19 of 18" is what the plain form says once the bracket starts, so
  // the postseason names the round it is in instead of counting past the end
  // of the regular season.
  const subtitle = isCampPhase(save.phase) ? `${String(save.season)} · ${PHASE_LABEL[save.phase]}`
    : done && d !== null
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

  /**
   * The five rows, each with what it is for, what tapping it does, and how far
   * the manager has got.
   *
   * Tapping always records a look. Only two of the five can be finished: the
   * depth chart, when it is actually reordered (marked beside that write), and
   * the game, which the league's own results complete without anything being
   * written down.
   */
  const rows = (data: DashboardOut): readonly ChecklistRow[] => {
    const played = data.record?.played ?? 0;
    const open = (item: ChecklistItem, go: () => void) => () => {
      void markChecklist(item, 'VIEWED');
      go();
    };
    const detailFor = (item: ChecklistItem, fallback: string): string => {
      if (item === 'roster') return `${String(data.shape.rosterCount)} players under contract`;
      if (item === 'depth') {
        return data.shape.depthStarters >= data.shape.positionGroups
          ? `A starter named in all ${String(data.shape.positionGroups)} groups`
          : `${String(data.shape.depthStarters)} of ${String(data.shape.positionGroups)} groups have a starter`;
      }
      if (item === 'cap') {
        return data.capSpace === null
          ? 'No cap sheet for this season'
          : data.capSpace < 0
            ? `${capLabel(data.capSpace)} over the ceiling`
            : `${capLabel(data.capSpace)} available`;
      }
      if (item === 'opponent') return data.thisWeek.opponentName ?? 'No game scheduled this week';
      return fallback;
    };
    const go: Readonly<Record<ChecklistItem, () => void>> = {
      roster: () => { nav.push('roster'); },
      depth: () => { nav.push('roster'); },
      cap: () => { setSheet('cap'); },
      opponent: () => { setSheet('opponent'); },
      // Not a navigation: the button is already on this screen, so this puts
      // the manager in front of it rather than sending them somewhere else to
      // find one. Focus as well as scroll, so a keyboard lands on it too.
      sim: () => {
        week.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        week.current?.querySelector('button')?.focus();
      },
    };
    return CHECKLIST_COPY.map((c) => ({
      key: c.key,
      title: c.title,
      detail: detailFor(c.key, c.detail),
      // "Play the game" is finished by the football, not by the tap.
      state: stateOf(checklist, c.key, c.key === 'sim' && played > 0),
      onSelect: open(c.key, go[c.key]),
    }));
  };

  return (
    <Screen title={title} subtitle={subtitle} screen="team">
      {isCampPhase(save.phase) && <CampEntry phase={save.phase} />}
      {q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
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
              // The compact-but-readable form, "Atlas East". It used to be
              // built by deleting the word "Conference" out of the full name,
              // which is a rename away from printing "Atlas Conference East"
              // in a tile sized for two words.
              { label: 'Division', value: divisionShort(d.identity) || '—' },
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
            <div ref={week} style={{ minWidth: 0 }}>
              {!isCampPhase(save.phase) && <ThisWeekCard
                week={d.thisWeek}
                weeks={save.weeks}
                busy={busy}
                onSim={() => {
                  if (d.thisWeek.state === 'SEASON_OVER') { nav.replaceRoot('play'); return; }
                  void simWeek();
                }}
                onPreview={() => {
                  void markChecklist('opponent', 'VIEWED');
                  setSheet('opponent');
                }}
                onDepthChart={() => { nav.push('roster'); }}
                onRecheck={() => { setAttempt((n) => n + 1); }}
              />}
            </div>
            <OwnerCard owner={d.owner} />
            <ChecklistCard
              rows={rows(d)}
              opening={(d.record?.played ?? 0) === 0}
              note={'A tick means the save holds the rows it describes, or the week has '
                + 'been played. The app does not record what you have read.'}
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
              title="Waiver wire"
              detail="Claim a released player before another club does"
              onSelect={() => { nav.push('waivers'); }}
              testId="to-waivers"
            />
            <HubCard
              title="Free agents"
              detail="Sign an unsigned player, any week of the season"
              onSelect={() => { nav.push('freeAgents'); }}
              testId="to-free-agents"
            />
            <HubCard
              title="Trade Center"
              detail="Build a package, and hear what they think of it"
              onSelect={() => { nav.push('trades'); }}
              testId="to-trades"
            />
            <HubCard
              title="Transactions"
              detail="Every cut, claim, signing and trade in the league"
              onSelect={() => { nav.push('transactions'); }}
              testId="to-transactions"
            />
            <HubCard
              title="Offseason moves"
              detail="Re-signings, free agency, the draft and trades"
              onSelect={() => { nav.push('offseason'); }}
              testId="to-offseason"
            />
            {/* Named because the tab promises them and dimmed because they do
                not exist. A card that looked tappable and did nothing would
                put the ones above it in doubt. */}
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
          </HubStack>

          <SectionHeader title="Roster" />
          <Panel padded={false}>
            <div style={{ padding: `0 ${String(S[3])}px` }} data-testid="roster-list">
              {d.squad.map((p) => (
                <ListRow
                  key={p.playerId}
                  leading={<PlayerFace avatars={faces} playerId={p.playerId} name={p.name} />}
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

      {sheet !== null && CHECKLIST_SHEETS[sheet] !== undefined && (
        <ChecklistSheet
          copy={CHECKLIST_SHEETS[sheet]}
          onClose={() => { setSheet(null); }}
          {...(sheet === 'cap' ? { onAction: () => { nav.replaceRoot('office'); } } : {})}
          {...(sheet === 'cap' && d !== null ? {
            facts: (
              <StatTiles
                stats={[
                  { label: 'Cap space', value: capLabel(d.capSpace), tone: (d.capSpace ?? 0) < 0 ? 'negative' : 'positive' },
                  { label: 'Roster', value: `${String(d.shape.rosterCount)}` },
                ]}
              />
            ),
          } : {})}
        />
      )}
    </Screen>
  );
}
