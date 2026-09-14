// The play-test app: the product's five tabs, driven by the engine in the page.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { COLOR, S } from '../../src/app/tokens';
import { Frame, TabBar } from './chrome';
import type { PositionGroup } from '../../supabase/functions/_shared/engine/types';
import { newDynasty, reorder, simWeek, type Game } from './host';
import { isWinter, PHASE_LABEL, runWinter, stepWinter, type MoveResult } from './winter';
import { OffseasonScreen } from './offseason';
import { adoptLegacy, clear, gmOf, persist, rename, restore, styleOf } from './persist';
import { LeagueScreen, ScheduleScreen } from './screens';
import { TeamTab } from './dashboard';
import { PlayScreen } from './play';
import { DEFAULT_GM_STYLE } from '../../src/screens/gmForm';
import { ALL } from '../../src/screens/teamFilters';
import {
  DEFAULT_DIFFICULTY, DEFAULT_SETTINGS,
} from '../../supabase/functions/_shared/api/franchiseOptions';
import { FranchiseFlow, type BootRoute } from './bootFlow';
import { teamProfiles } from './board';
import {
  CreateGmScreen, CreditsPanel, DatabaseToolsScreen, type GmDraft, HomeScreen,
  SettingsPanel, SlotsScreen,
} from './boot';
import { BracketScreen } from './bracket';
import { StaffScreen } from './staff';
import { RecapScreen } from './recap';
import { BoxScore, NewsScreen, OfficeScreen, PlayerScreen, RosterScreen } from './detail';


const TITLES: Readonly<Record<string, string>> = {
  team: 'Team', play: 'Play', league: 'League', news: 'News', office: 'Office',
  // Both were tabs of their own and are now opened from the tab whose job
  // they are part of, the way the app opens them.
  schedule: 'Schedule', roster: 'Roster',
  player: 'Player', game: 'Box score', playoffs: 'Playoffs',
  staff: 'Staff', recap: 'Season recap',
};

interface Drill { readonly screen: string; readonly id: string }

/** Where the player is before a dynasty is open. `play` is in one. The three
 *  franchise-building routes are named in bootFlow.tsx, which renders them. */
type Route = BootRoute | 'home' | 'slots' | 'gm' | 'play'
  // The main menu's foot. Reachable with no dynasty open, like the rest of the
  // boot flow, and Back from any of them returns to the menu.
  | 'settings' | 'dbtools' | 'credits';

/** The three utility destinations, titled the way the app titles them. */
const UTILITY: Readonly<Record<string, { title: string; subtitle: string }>> = {
  settings: { title: 'Settings', subtitle: 'Preferences' },
  dbtools: { title: 'Database Tools', subtitle: 'Developer' },
  credits: { title: 'Credits', subtitle: 'Who built this' },
};

export function App() {
  // A save written by the build that kept one nameless dynasty becomes file 1,
  // so nobody loses a season to this change.
  useState(() => { adoptLegacy(); return null; });
  const [game, setGame] = useState<Game | null>(null);
  const [route, setRoute] = useState<Route>('home');
  // Which file is open and who manages it. Both travel with every save.
  const [slot, setSlot] = useState(1);
  const [gm, setGm] = useState<string | null>(null);
  const [gmStyle, setGmStyle] = useState<string | null>(null);
  // The franchise being set up: held here rather than inside the GM screen, so
  // walking on to the team list and back does not lose what was typed.
  const [pending, setPending] = useState<GmDraft | null>(null);
  // Which errand the save-file screen is on: starting a game, or opening one.
  const [creating, setCreating] = useState(true);
  // Bumped when a file is deleted, so the file list re-reads storage.
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState('team');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [group, setGroup] = useState('QB');
  // The league screen's split, sort, competition and board, held on the frame
  // the way the product holds them in navigation state.
  const [leagueUi, setLeagueUi] = useState<Record<string, string>>({});
  const [week, setWeek] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(
    () => { if (game !== null) persist(game, slot, gm, gmStyle); },
    [game, slot, gm, gmStyle]);

  const open = useCallback((screen: string, id: string) => {
    setDrill({ screen, id });
    window.scrollTo(0, 0);
  }, []);

  // Measured once for the life of the page: the packed seed does not change,
  // and re-reading 3,066 players every time the player types a letter into the
  // search box is a frame budget spent on nothing.
  const board = useMemo(() => teamProfiles(), []);
  // The board's search and chip, held here for the same reason the app holds
  // them on the navigation frame: walking to the scouting report and back must
  // not reset them.
  const [boardFilter, setBoardFilter] = useState(ALL);
  const [boardQuery, setBoardQuery] = useState('');

  const start = (teamId: string): void => {
    if (pending === null) return;
    setBusy('Building the league…');
    // A frame first, so the button shows what it is doing before the world is
    // built: loading 3,000 players is a second of work on a phone.
    setTimeout(() => {
      setSlot(pending.slot);
      setGm(`${pending.first.trim()} ${pending.last.trim()}`.trim());
      setGmStyle(pending.style);
      setGame(newDynasty(teamId));
      setPending(null);
      setTab('team'); setDrill(null); setBusy(null); setRoute('play');
    }, 30);
  };

  /** Open a file. A file this build cannot read says so and stays where it is. */
  const openSlot = (n: number): void => {
    setBusy('Opening the dynasty…');
    setTimeout(() => {
      const loaded = restore(n);
      setBusy(null);
      if (loaded === null) {
        setNotice(`File ${String(n)} could not be opened by this build.`);
        return;
      }
      setSlot(n);
      setGm(gmOf(n));
      setGmStyle(styleOf(n));
      setGame(loaded);
      setNotice(null);
      setTab('team'); setDrill(null); setRoute('play');
    }, 30);
  };

  /** Close the dynasty and go back to the front door. Nothing is deleted. */
  const toMenu = (): void => {
    setGame(null); setDrill(null); setNotice(null); setRoute('home');
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
      if (next.phase === 'REGULAR_SEASON') { setTab('play'); setDrill(null); }
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

  /** The column, its sticky title, and whatever sits under it.
   *
   *  `onBack` is passed rather than derived: in a dynasty the arrow closes a
   *  drill-down, and in the boot flow it steps back through the save file, the
   *  name and the team. Two different questions, one frame. */

  const bootShell = (
    title: string, subtitle: string, onBack: () => void, body: React.ReactNode,
  ): React.ReactElement => (
    <Frame title={title} subtitle={subtitle} onBack={onBack} forNav={false}>{body}</Frame>
  );

  if (game === null) {
    if (route === 'home') {
      return (
        <HomeScreen
          onNew={() => { setCreating(true); setPending(null); setNotice(null); setRoute('slots'); }}
          onLoad={() => { setCreating(false); setPending(null); setNotice(null); setRoute('slots'); }}
          onUtility={(to) => { setRoute(to); }}
        />
      );
    }

    const utility = UTILITY[route];
    if (utility !== undefined) {
      return bootShell(utility.title, utility.subtitle, () => { setRoute('home'); }, (
        <>
          {route === 'settings' && <SettingsPanel />}
          {route === 'dbtools' && <DatabaseToolsScreen />}
          {route === 'credits' && <CreditsPanel />}
        </>
      ));
    }

    const title = route === 'slots' ? (creating ? 'New Franchise' : 'Load Franchise')
      : route === 'gm' ? 'Create GM'
        : route === 'preview' ? 'Team Preview'
          : route === 'franchiseSettings' ? 'Franchise Settings'
            : route === 'confirmFranchise' ? 'Confirm Franchise'
              : route === 'worldGen' ? 'Building Franchise World' : 'Select Team';
    const gmLine = `${`${pending?.first ?? ''} ${pending?.last ?? ''}`.trim()} · File ${String(pending?.slot ?? 1)}`;
    const subtitle = route === 'slots' ? (creating ? 'Choose save file' : 'Save files')
      : route === 'gm' ? `File ${String(pending?.slot ?? 1)}` : gmLine;
    const back = (): void => {
      if (route === 'slots') { setPending(null); setRoute('home'); return; }
      if (route === 'preview') { setRoute('pick'); return; }
      if (route === 'franchiseSettings') { setRoute('preview'); return; }
      if (route === 'confirmFranchise') { setRoute('franchiseSettings'); return; }
      // Nothing to go back to once the world is being built: the only way out
      // is the failure card's own Return to Main Menu.
      if (route === 'worldGen') return;
      setRoute(route === 'gm' ? 'slots' : 'gm');
    };
    return bootShell(title, subtitle, back, (
      <>
        {notice !== null && (
          <p
            data-testid="notice"
            style={{ margin: `0 0 ${String(S[2])}px`, color: COLOR.red, fontSize: 13, lineHeight: 1.5 }}
          >
            {notice}
          </p>
        )}
        {route === 'slots' && (
          <SlotsScreen
            key={refresh}
            creating={creating}
            onOpen={openSlot}
            onStart={(n) => {
              // A fresh draft per file, unless the player is walking back into
              // the one they were already filling in.
              setPending((d) => (d !== null && d.slot === n
                ? d
                : {
                  slot: n, first: '', last: '', style: DEFAULT_GM_STYLE, teamId: null,
                  difficulty: DEFAULT_DIFFICULTY, settings: DEFAULT_SETTINGS,
                  saveName: null,
                }));
              setRoute('gm');
            }}
            onDelete={(n) => { clear(n); setNotice(null); setRefresh((r) => r + 1); }}
            onRename={(n, name) => {
              if (!rename(n, name)) setNotice(`File ${String(n)} could not be renamed.`);
              else setNotice(null);
              setRefresh((r) => r + 1);
            }}
          />
        )}
        {route === 'gm' && pending !== null && (
          <CreateGmScreen
            draft={pending}
            onDraft={setPending}
            onContinue={() => { setRoute('pick'); }}
          />
        )}
        <FranchiseFlow
          route={route}
          board={board}
          busy={busy}
          pending={pending}
          filter={boardFilter}
          query={boardQuery}
          onFilter={setBoardFilter}
          onQuery={setBoardQuery}
          onPending={setPending}
          onRoute={setRoute}
          onStart={start}
          onMenu={() => { setPending(null); setNotice(null); setRoute('home'); }}
        />
      </>
    ));
  }

  const club = game.clubs.get(game.userTeamId);
  const screen = drill?.screen ?? tab;
  const title = screen === 'team'
    ? (club?.nickname ?? 'Team')
    : screen === 'play' && isWinter(game.phase)
      ? 'Offseason'
      : (TITLES[screen] ?? 'Dynasty');
  const subtitle = `${String(game.season)} · ${isWinter(game.phase)
    ? PHASE_LABEL[game.phase]
    : game.phase === 'PLAYOFFS'
      ? 'Playoffs'
      : `Week ${String(game.week)} of ${String(game.weeks)}`}`;

  /** A drill-down, or null when the tab itself is what is on screen. */
  const drilled = (d: Drill) => {
    if (d.screen === 'player') return <PlayerScreen game={game} id={d.id} />;
    if (d.screen === 'playoffs') return <BracketScreen game={game} open={open} />;
    if (d.screen === 'staff') return <StaffScreen game={game} open={open} />;
    if (d.screen === 'recap') return <RecapScreen game={game} open={open} />;
    if (d.screen === 'schedule') {
      return <ScheduleScreen game={game} open={open} week={week} setWeek={setWeek} />;
    }
    if (d.screen === 'roster') {
      return (
        <RosterScreen
          game={game}
          open={open}
          group={group}
          setGroup={setGroup}
          move={(id, dir) => { setGame(reorder(game, group as PositionGroup, id, dir)); }}
        />
      );
    }
    return <BoxScore game={game} id={d.id} open={open} />;
  };

  const body = drill !== null ? drilled(drill) : (
    <>
      {tab === 'office' && <OfficeScreen game={game} open={open} onRestart={toMenu} />}
      {tab === 'team' && (
        <TeamTab game={game} open={open} busy={busy} onSim={() => { void runWeeks(false); }} />
      )}
      {/* The week and the offseason are the same job -- moving the season on --
          so they share the tab that does it. */}
      {tab === 'play' && isWinter(game.phase) && (
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
      {tab === 'play' && !isWinter(game.phase) && (
        <PlayScreen
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
      {tab === 'news' && <NewsScreen game={game} />}
    </>
  );

  return (
    <>
      <Frame
        title={title}
        subtitle={subtitle}
        onBack={drill === null ? null : () => { setDrill(null); }}
        forNav
      >
        {body}
      </Frame>
      <TabBar
        tab={drill === null ? tab : ''}
        onTab={(key) => { setTab(key); setDrill(null); window.scrollTo(0, 0); }}
      />
    </>
  );
}
