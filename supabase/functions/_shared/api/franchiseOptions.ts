// The rules a franchise is played under.
//
// The keys live on the server because the server is what refuses an unknown
// one: a client that could invent a value could write something the migration's
// CHECK has never heard of, and the constraint would answer with a 500 rather
// than a sentence. The labels and the explanations live on the client, in
// src/screens/settingsCatalogue.ts, because they are copy; a test asserts the
// two sides name the same settings and the same options.
//
// None of these is read by the simulation yet. They are stored because the
// screen asks for them, and a question the save discards is a question that
// should not have been asked -- the same argument that put gm_style on the
// saves table. What is different here is that these settings promise specific
// behaviour ("injuries are lighter"), so the screen says plainly that the
// promise is not kept yet rather than letting a player infer it is.

/** Every setting, and the values it accepts. Order is the order the segmented
 *  controls render in, and the first value of each is not a default -- the
 *  defaults are the Normal preset below, which is a choice rather than a
 *  position in a list. */
export const FRANCHISE_OPTIONS = {
  injuryFrequency: ['LOW', 'NORMAL', 'HIGH'],
  salaryCap: ['ON', 'OFF'],
  tradeDifficulty: ['EASY', 'NORMAL', 'HARD'],
  draftClassStrength: ['WEAK', 'NORMAL', 'STRONG', 'RANDOM'],
  playerDevelopment: ['SLOW', 'NORMAL', 'FAST'],
  scoutingVisibility: ['FULL', 'PARTIAL', 'HIDDEN'],
  autoSimCpuGames: ['ON', 'OFF'],
  commissionerMode: ['OFF', 'ON'],
} as const;

export type SettingKey = keyof typeof FRANCHISE_OPTIONS;

export type FranchiseSettings = {
  readonly [K in SettingKey]: (typeof FRANCHISE_OPTIONS)[K][number];
};

export const SETTING_KEYS = Object.keys(FRANCHISE_OPTIONS) as readonly SettingKey[];

/** The four difficulties. `CUSTOM` is not a preset -- it is what the franchise
 *  is called once the player has set the rows themselves. */
export const DIFFICULTIES = ['EASY', 'NORMAL', 'HARD', 'CUSTOM'] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * What each difficulty sets the rows to.
 *
 * Written out in full rather than as overrides on Normal, because a preset is
 * a statement about all eight settings and a reader should be able to see all
 * eight without holding a diff in their head.
 */
export const PRESETS: Readonly<Record<'EASY' | 'NORMAL' | 'HARD', FranchiseSettings>> = {
  EASY: {
    injuryFrequency: 'LOW',
    salaryCap: 'ON',
    tradeDifficulty: 'EASY',
    draftClassStrength: 'STRONG',
    playerDevelopment: 'FAST',
    scoutingVisibility: 'FULL',
    autoSimCpuGames: 'ON',
    commissionerMode: 'OFF',
  },
  NORMAL: {
    injuryFrequency: 'NORMAL',
    salaryCap: 'ON',
    tradeDifficulty: 'NORMAL',
    draftClassStrength: 'NORMAL',
    playerDevelopment: 'NORMAL',
    scoutingVisibility: 'FULL',
    autoSimCpuGames: 'ON',
    commissionerMode: 'OFF',
  },
  HARD: {
    injuryFrequency: 'HIGH',
    salaryCap: 'ON',
    tradeDifficulty: 'HARD',
    draftClassStrength: 'NORMAL',
    playerDevelopment: 'SLOW',
    scoutingVisibility: 'PARTIAL',
    autoSimCpuGames: 'ON',
    commissionerMode: 'OFF',
  },
};

/** Where the screen opens. Normal, and said once so both builds agree. */
export const DEFAULT_DIFFICULTY: Difficulty = 'NORMAL';
export const DEFAULT_SETTINGS: FranchiseSettings = PRESETS.NORMAL;

/** Whether every row matches a preset. Used to decide whether a franchise is
 *  still on that difficulty or has become Custom. */
export function matchesPreset(
  settings: FranchiseSettings, preset: 'EASY' | 'NORMAL' | 'HARD',
): boolean {
  return SETTING_KEYS.every((key) => settings[key] === PRESETS[preset][key]);
}

/** The difficulty a set of rows amounts to: the preset it matches, or Custom.
 *  Checked in order, so a set matching two presets is named by the first --
 *  which cannot happen while the three differ, and a test says so. */
export function difficultyOf(settings: FranchiseSettings): Difficulty {
  for (const preset of ['EASY', 'NORMAL', 'HARD'] as const) {
    if (matchesPreset(settings, preset)) return preset;
  }
  return 'CUSTOM';
}

function isOption(key: SettingKey, value: unknown): boolean {
  return typeof value === 'string'
    && (FRANCHISE_OPTIONS[key] as readonly string[]).includes(value);
}

/**
 * Reads settings off the wire, or refuses them.
 *
 * All eight or none: a franchise recorded with five of them is a save nobody
 * can say was played on Hard, and filling the other three from a default would
 * write values indistinguishable from ones the player chose.
 */
export function parseSettings(raw: unknown): FranchiseSettings | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('franchise settings must be an object');
  }
  const record = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of SETTING_KEYS) {
    const value = record[key];
    if (value === undefined) throw new Error(`franchise settings are missing "${key}"`);
    if (!isOption(key, value)) {
      throw new Error(`"${String(value)}" is not a value for "${key}"`);
    }
    out[key] = value as string;
  }
  const extra = Object.keys(record).filter((k) => !(SETTING_KEYS as readonly string[]).includes(k));
  if (extra.length > 0) {
    // Refused rather than dropped: an unknown key means the two catalogues have
    // drifted, and silently discarding it hides that behind a save that looks
    // fine until somebody notices a setting is gone.
    throw new Error(`unknown franchise setting "${extra[0] ?? ''}"`);
  }
  return out as unknown as FranchiseSettings;
}
