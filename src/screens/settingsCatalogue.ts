// What the eight settings are called, and what each one changes.
//
// The keys and the allowed values are the server's -- franchiseOptions.ts holds
// the list it validates against, and a test asserts these name the same eight
// settings with the same values. The labels and the explanations live here
// because they are copy, and copy belongs on the side that renders it.
//
// Every explanation says what the setting changes, in the present tense, as a
// statement about the franchise. None of them is hedged with "will" or "soon":
// the screen carries one honest line about what the simulation reads today, in
// one place, rather than eight apologies.

import {
  FRANCHISE_OPTIONS, type Difficulty, type SettingKey,
} from '../../supabase/functions/_shared/api/franchiseOptions';

export interface SettingDef {
  readonly key: SettingKey;
  readonly title: string;
  readonly detail: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

const opt = (key: SettingKey, labels: readonly string[]): SettingDef['options'] =>
  FRANCHISE_OPTIONS[key].map((value, i) => ({ value, label: labels[i] ?? value }));

export const SETTINGS: readonly SettingDef[] = [
  {
    key: 'injuryFrequency',
    title: 'Injury Frequency',
    detail: 'How often players get hurt, in games and across a season.',
    options: opt('injuryFrequency', ['Low', 'Normal', 'High']),
  },
  {
    key: 'salaryCap',
    title: 'Salary Cap',
    detail: 'Whether contracts have to fit under the cap. Off removes the ceiling '
      + 'on what a roster can cost.',
    options: opt('salaryCap', ['On', 'Off']),
  },
  {
    key: 'tradeDifficulty',
    title: 'Trade Difficulty',
    detail: 'How much other clubs ask for, and how readily they say yes.',
    options: opt('tradeDifficulty', ['Easy', 'Normal', 'Hard']),
  },
  {
    key: 'draftClassStrength',
    title: 'Draft Class Strength',
    detail: 'How much talent comes out each year. Random varies it season to season.',
    options: opt('draftClassStrength', ['Weak', 'Normal', 'Strong', 'Random']),
  },
  {
    key: 'playerDevelopment',
    title: 'Player Development',
    detail: 'How quickly young players reach their potential, and how soon older '
      + 'ones decline.',
    options: opt('playerDevelopment', ['Slow', 'Normal', 'Fast']),
  },
  {
    key: 'scoutingVisibility',
    title: 'Scouting Visibility',
    detail: 'How much of a player you can see. Partial Ratings hides some prospect '
      + 'and player certainty; Hidden Potential shows what a player is and never '
      + 'what he might become.',
    options: opt('scoutingVisibility', ['Full Ratings', 'Partial Ratings', 'Hidden Potential']),
  },
  {
    key: 'autoSimCpuGames',
    title: 'Auto-Sim CPU Games',
    detail: 'Whether the rest of the league plays its week automatically when you '
      + 'play yours.',
    options: opt('autoSimCpuGames', ['On', 'Off']),
  },
  {
    key: 'commissionerMode',
    title: 'Commissioner Mode',
    detail: 'Unlocks editing tools that can change ratings, rosters, teams and saves.',
    options: opt('commissionerMode', ['Off', 'On']),
  },
];

export interface DifficultyDef {
  readonly key: Difficulty;
  readonly label: string;
  readonly detail: string;
}

export const DIFFICULTY_CARDS: readonly DifficultyDef[] = [
  {
    key: 'EASY',
    label: 'Easy',
    detail: 'Owner pressure is softer, injuries are lighter, trades come easier '
      + 'and players develop more forgivingly.',
  },
  {
    key: 'NORMAL',
    label: 'Normal',
    detail: 'The intended balanced experience.',
  },
  {
    key: 'HARD',
    label: 'Hard',
    detail: 'Cap pressure, owner expectations, injuries and trade negotiations all '
      + 'become more demanding.',
  },
  {
    key: 'CUSTOM',
    label: 'Custom',
    detail: 'Set each rule yourself. The rows below unlock.',
  },
];

/** The label a stored value reads as, or null where this build does not know
 *  the value -- a save written by a later version, read by an older client. */
export function optionLabel(key: SettingKey, value: string): string | null {
  const def = SETTINGS.find((s) => s.key === key);
  return def?.options.find((o) => o.value === value)?.label ?? null;
}

export function settingTitle(key: SettingKey): string | null {
  return SETTINGS.find((s) => s.key === key)?.title ?? null;
}

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTY_CARDS.find((d) => d.key === difficulty)?.label ?? difficulty;
}
