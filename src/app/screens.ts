// The screen registry.
//
// legacy/UI.md records a static flow test asserting that every navigation target
// resolves to a real screen and every screen is reachable. A target with nothing
// behind it is a dead end that only surfaces when someone taps it, so the
// registry is checked by test rather than by hope.

import type { ComponentType } from 'react';
import { HomeScreen } from '../screens/HomeScreen';
import { SlotsScreen } from '../screens/SlotsScreen';
import { CreateGmScreen } from '../screens/CreateGmScreen';
import { SelectTeamScreen } from '../screens/SelectTeamScreen';
import { LeagueScreen } from '../screens/LeagueScreen';
import { PlayoffsScreen } from '../screens/PlayoffsScreen';
import { OfficeScreen } from '../screens/OfficeScreen';
import { RosterScreen } from '../screens/RosterScreen';
import { ScheduleScreen } from '../screens/ScheduleScreen';
import { TeamScreen } from '../screens/TeamScreen';
import { StaffScreen } from '../screens/StaffScreen';
import { RecapScreen } from '../screens/RecapScreen';
import { OffseasonScreen } from '../screens/OffseasonScreen';
import { CreditsScreen, DatabaseToolsScreen, SettingsScreen } from '../screens/MenuScreens';
import {
  CoachScreen, CollegeScreen, DraftPickScreen, GameScreen, PlayerScreen,
  ScoutingScreen, TransactionsScreen,
} from '../screens/EntityScreens';

export interface ScreenDef {
  readonly title: string;
  readonly Component: ComponentType;
  /** A screen the stack can rest on: the five bottom-navigation destinations,
   *  and the Home Screen the boot flow starts from. */
  readonly root: boolean;
  /** Part of getting into a game rather than part of playing one. These render
   *  without the bottom navigation -- there is nothing to navigate to yet --
   *  and fall back to Home rather than to Team. */
  readonly boot?: true;
}

export const SCREENS: Readonly<Record<string, ScreenDef>> = {
  // Getting in: Home -> New Game or Load Game -> a save file -> a GM name ->
  // a club -> the franchise dashboard. docs/PLAYING.md walks it.
  home: { title: 'Dynasty Manager', Component: HomeScreen, root: true, boot: true },
  slots: { title: 'Save files', Component: SlotsScreen, root: false, boot: true },
  gm: { title: 'Create GM', Component: CreateGmScreen, root: false, boot: true },
  pickTeam: { title: 'Select Team', Component: SelectTeamScreen, root: false, boot: true },

  // The main menu's foot. Boot screens too: they are reachable with no dynasty
  // open, so they must not render a bar of tabs that would go nowhere, and
  // Back from any of them belongs on the menu rather than on Team.
  settings: { title: 'Settings', Component: SettingsScreen, root: false, boot: true },
  dbtools: { title: 'Database Tools', Component: DatabaseToolsScreen, root: false, boot: true },
  credits: { title: 'Credits', Component: CreditsScreen, root: false, boot: true },

  // Bottom navigation.
  team: { title: 'Team', Component: TeamScreen, root: true },
  league: { title: 'League', Component: LeagueScreen, root: true },
  schedule: { title: 'Schedule', Component: ScheduleScreen, root: true },
  roster: { title: 'Roster', Component: RosterScreen, root: true },
  office: { title: 'Office', Component: OfficeScreen, root: true },

  // Reached from League, from Team while the bracket is live, and from the
  // Schedule's playoff weeks.
  playoffs: { title: 'Playoffs', Component: PlayoffsScreen, root: false },
  recap: { title: 'Season recap', Component: RecapScreen, root: false },
  offseason: { title: 'Offseason', Component: OffseasonScreen, root: false },

  // Drill-downs. Every one of these is a resolveEntityRoute target.
  player: { title: 'Player', Component: PlayerScreen, root: false },
  coach: { title: 'Coach', Component: CoachScreen, root: false },
  college: { title: 'College', Component: CollegeScreen, root: false },
  game: { title: 'Game', Component: GameScreen, root: false },
  draftPick: { title: 'Draft pick', Component: DraftPickScreen, root: false },

  // Reached from the Office list.
  scouting: { title: 'Scouting', Component: ScoutingScreen, root: false },
  staff: { title: 'Staff', Component: StaffScreen, root: false },
  transactions: { title: 'Transactions', Component: TransactionsScreen, root: false },
};

/** Where a player with a dynasty open lands. */
export const DEFAULT_SCREEN = 'team';

/** Where a player with none lands: the front door. */
export const HOME_SCREEN = 'home';

export function screenFor(key: string): ScreenDef | undefined {
  return SCREENS[key];
}

export const isBootScreen = (key: string): boolean => SCREENS[key]?.boot === true;

/** The root a drill-down is opened on top of, so back() always has a home.
 *  A boot screen falls back to Home, not to Team: Back from the club list
 *  belongs on the menu, and Team has no dynasty behind it yet. */
export function rootFor(key: string): string {
  const def = SCREENS[key];
  if (def?.root === true) return key;
  return def?.boot === true ? HOME_SCREEN : DEFAULT_SCREEN;
}
