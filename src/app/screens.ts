// The screen registry.
//
// legacy/UI.md records a static flow test asserting that every navigation target
// resolves to a real screen and every screen is reachable. A target with nothing
// behind it is a dead end that only surfaces when someone taps it, so the
// registry is checked by test rather than by hope.

import type { ComponentType } from 'react';
import { LeagueScreen } from '../screens/LeagueScreen';
import { PlayoffsScreen } from '../screens/PlayoffsScreen';
import { OfficeScreen } from '../screens/OfficeScreen';
import { RosterScreen } from '../screens/RosterScreen';
import { ScheduleScreen } from '../screens/ScheduleScreen';
import { TeamScreen } from '../screens/TeamScreen';
import {
  CoachScreen, CollegeScreen, DraftPickScreen, GameScreen, PlayerScreen,
  ScoutingScreen, StaffScreen, TransactionsScreen,
} from '../screens/EntityScreens';

export interface ScreenDef {
  readonly title: string;
  readonly Component: ComponentType;
  /** One of the five bottom-navigation destinations. */
  readonly root: boolean;
}

export const SCREENS: Readonly<Record<string, ScreenDef>> = {
  // Bottom navigation.
  team: { title: 'Team', Component: TeamScreen, root: true },
  league: { title: 'League', Component: LeagueScreen, root: true },
  schedule: { title: 'Schedule', Component: ScheduleScreen, root: true },
  roster: { title: 'Roster', Component: RosterScreen, root: true },
  office: { title: 'Office', Component: OfficeScreen, root: true },

  // Reached from League, from Team while the bracket is live, and from the
  // Schedule's playoff weeks.
  playoffs: { title: 'Playoffs', Component: PlayoffsScreen, root: false },

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

export const DEFAULT_SCREEN = 'team';

export function screenFor(key: string): ScreenDef | undefined {
  return SCREENS[key];
}

/** The root a drill-down is opened on top of, so back() always has a home. */
export function rootFor(key: string): string {
  const def = SCREENS[key];
  return def?.root === true ? key : DEFAULT_SCREEN;
}
