// The play-test app: the product's five tabs, driven by the engine in the page.

import { useCallback, useEffect, useState } from 'react';
import { COLOR, FONT, LAYOUT } from '../../src/app/tokens';
import { Panel, SectionHeader } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { TeamMark } from '../../src/components/TeamMark';
import {
  CalendarIcon, LeagueIcon, OfficeIcon, RosterIcon, ShieldIcon,
} from '../../src/components/icons';
import type { PositionGroup } from '../../supabase/functions/_shared/engine/types';
import { newDynasty, reorder, simWeek, type Game } from './host';
import { isWinter, PHASE_LABEL, runWinter, stepWinter, type MoveResult } from './winter';
import { OffseasonScreen } from './offseason';
import { clear, persist, restore } from './persist';
import { clubs as allClubs } from './world';
import { LeagueScreen, ScheduleScreen, TeamScreen } from './screens';
import { BracketScreen } from './bracket';
import { StaffScreen } from './staff';
import { RecapScreen } from './recap';
import { BoxScore, OfficeScreen, PlayerScreen, RosterScreen } from './detail';

const TABS = [
  { key: 'team', label: 'Team', Icon: ShieldIcon },
  { key: 'league', label: 'League', Icon: LeagueIcon },
  { key: 'schedule', label: 'Schedule', Icon: CalendarIcon },
  { key: 'roster', label: 'Roster', Icon: RosterIcon },
  { key: 'office', label: 'Office', Icon: OfficeIcon },
] as const;

const TITLES: Readonly<Record<string, string>> = {
  team: 'Team', league: 'League', schedule: 'Schedule', roster: 'Roster',
  office: 'Office', player: 'Player', game: 'Box score', playoffs: 'Playoffs',
  staff: 'Staff', recap: 'Season recap',
};

interface Drill { readonly screen: string; readonly id: string }

export function App() {
  const [game, setGame] = useState<Game | null>(() => restore());
  const [tab, setTab] = useState('team');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [group, setGroup] = useState('QB');
  // The league screen's split, sort, competition and board, held on the frame
  // the way the product holds them in navigation state.
  const [leagueUi, setLeagueUi] = useState<Record<string, string>>({});
  const [week, setWeek] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { if (game !== null) persist(game); }, [game]);

  const open = useCallback((screen: string, id: string) => {
    setDrill({ screen, id });
    window.scrollTo(0, 0);
  }, []);

  const start = (teamId: string): void => {
    setBusy('Building the league…');
    // A frame first, so the button shows what it is doing before the world is
    // built: loading 3,000 players is a second of work on a phone.
    setTimeout(() => {
      setGame(newDynasty(teamId));
      setTab('team'); setDrill(null); setBusy(null);
    }, 30);
  };

  const runWeeks = async (all: boolean): Promise<void> => {
    if (game === null) return;
    let next = game;
    setBusy(`Simulating week ${String(next.week)}…`);
    do {
      // Yields between weeks so the label repaints and the tap feels answered
      // rather than frozen.
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      next = simWeek(next);
      if (all && next.phase === 'REGULAR_SEASON') setBusy(`Simulating week ${String(next.week)}…`);
      // "Sim to end of season" stops when the regular season does: the
      // bracket is played a round at a time.
    } while (all && next.phase === 'REGULAR_SEASON');
    setGame(next);
    setBusy(null);
  };

  /** One step of the winter, or the rest of it in one go. */
  const winter = (all: boolean): void => {
    if (game === null) return;
    setBusy(all ? 'Running the offseason…' : 'Working…');
    setTimeout(() => {
      const next = all ? runWinter(game) : stepWinter(game);
      setGame(next);
      setNotice(null);
      if (next.phase === 'REGULAR_SEASON') { setTab('team'); setDrill(null); }
      setBusy(null);
    }, 30);
  };

  /** A move the manager makes himself. The engine refuses what it must, and
   *  what it says is shown either way. */
  const move = (make: (g: Game) => MoveResult): void => {
    if (game === null) return;
    const result = make(game);
    setGame(result.game);
    setNotice(result.detail);
  };

  const shell = (title: string, subtitle: string, body: React.ReactNode): React.ReactElement => (
    <div style={{ minHeight: '100%', display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          width: '100%', maxWidth: LAYOUT.shellMax, minWidth: 0,
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          paddingBottom: `calc(${String(LAYOUT.navHeight)}px + env(safe-area-inset-bottom, 0px) + 16px)`,
        }}
      >
        <header
          style={{
            position: 'sticky', top: 0, zIndex: 10, background: COLOR.ink,
            borderBottom: `1px solid ${COLOR.line}`, padding: '14px 16px 10px',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}
        >
          {drill !== null && (
            <button
              type="button"
              onClick={() => { setDrill(null); }}
              aria-label="Back"
              style={{
                background: 'none', border: 'none', color: COLOR.amber, fontSize: 22,
                lineHeight: 1, padding: '2px 6px 0 0', cursor: 'pointer',
              }}
            >
              ‹
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{
              margin: 0, fontFamily: FONT.display, fontSize: 26, lineHeight: 1.05,
              letterSpacing: '0.02em', textTransform: 'uppercase', color: COLOR.tx,
            }}
            >
              {title}
            </h1>
            <p style={{ margin: '2px 0 0', color: COLOR.mut, fontSize: 12 }}>{subtitle}</p>
          </div>
        </header>
        <main style={{ padding: '10px 16px 0' }}>{body}</main>
      </div>
    </div>
  );

  if (game === null) {
    const clubList = [...allClubs().values()];
    return shell('New dynasty', 'Pick the club you manage', (
      <>
        <SectionHeader title="Choose your club" />
        <p style={{ margin: '0 0 8px', color: COLOR.mut, fontSize: 12, lineHeight: 1.5 }}>
          Thirty-two clubs, 3,066 players, the season the seed ships with. Your dynasty is
          saved in this browser only.
        </p>
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="club-list">
            {clubList.map((club) => (
              <ListRow
                key={club.id}
                leading={<TeamMark abbreviation={club.id} primary={club.primary} secondary={club.secondary} size={32} />}
                title={club.name}
                subtitle={`${club.conferenceId} · ${club.divisionId}`}
                navigable={busy === null}
                onSelect={() => { if (busy === null) start(club.id); }}
              />
            ))}
          </div>
        </Panel>
        {busy !== null && (
          <p style={{ margin: '12px 0 0', color: COLOR.amber, fontSize: 13 }}>{busy}</p>
        )}
      </>
    ));
  }

  const club = game.clubs.get(game.userTeamId);
  const screen = drill?.screen ?? tab;
  const title = screen === 'team'
    ? (isWinter(game.phase) ? 'Offseason' : club?.nickname ?? 'Team')
    : (TITLES[screen] ?? 'Dynasty');
  const subtitle = `${String(game.season)} · ${isWinter(game.phase)
    ? PHASE_LABEL[game.phase]
    : game.phase === 'PLAYOFFS'
      ? 'Playoffs'
      : `Week ${String(game.week)} of ${String(game.weeks)}`}`;

  const body = drill !== null
    ? (drill.screen === 'player'
      ? <PlayerScreen game={game} id={drill.id} />
      : drill.screen === 'playoffs'
        ? <BracketScreen game={game} open={open} />
        : drill.screen === 'staff'
          ? <StaffScreen game={game} open={open} />
          : drill.screen === 'recap'
            ? <RecapScreen game={game} open={open} />
            : <BoxScore game={game} id={drill.id} open={open} />)
    : (
      <>
        {tab === 'team' && isWinter(game.phase) && (
          <OffseasonScreen
            game={game}
            open={open}
            phase={game.phase}
            busy={busy}
            notice={notice}
            onStep={() => { winter(false); }}
            onRunAll={() => { winter(true); }}
            onMove={move}
          />
        )}
        {tab === 'team' && !isWinter(game.phase) && (
          <TeamScreen
            game={game}
            open={open}
            busy={busy}
            onWeek={() => { void runWeeks(false); }}
            onSeason={() => { void runWeeks(true); }}
            onOffseason={() => { winter(false); }}
            onBracket={() => { open('playoffs', ''); }}
          />
        )}
        {tab === 'league' && (
          <LeagueScreen
            game={game}
            open={open}
            ui={leagueUi}
            setUi={(key, value) => { setLeagueUi((prev) => ({ ...prev, [key]: value })); }}
          />
        )}
        {tab === 'schedule' && (
          <ScheduleScreen game={game} open={open} week={week} setWeek={setWeek} />
        )}
        {tab === 'roster' && (
          <RosterScreen
            game={game}
            open={open}
            group={group}
            setGroup={setGroup}
            move={(id, d) => { setGame(reorder(game, group as PositionGroup, id, d)); }}
          />
        )}
        {tab === 'office' && (
          <OfficeScreen
            game={game}
            open={open}
            onRestart={() => { clear(); setGame(null); setDrill(null); }}
          />
        )}
      </>
    );

  return (
    <>
      {shell(title, subtitle, body)}
      <nav
        aria-label="Sections"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20,
          background: COLOR.panel, borderTop: `1px solid ${COLOR.line}`,
          display: 'grid', gridTemplateColumns: `repeat(${String(TABS.length)}, minmax(0, 1fr))`,
          height: `calc(${String(LAYOUT.navHeight)}px + env(safe-area-inset-bottom, 0px))`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {TABS.map(({ key, label, Icon }) => {
          const active = drill === null && tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setDrill(null); window.scrollTo(0, 0); }}
              {...(active ? { 'aria-current': 'page' as const } : {})}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', minWidth: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 3, padding: 0,
                color: active ? COLOR.amber : COLOR.mut,
                borderTop: `2px solid ${active ? COLOR.amber : 'transparent'}`,
              }}
            >
              <Icon size={20} />
              <span style={{ fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
