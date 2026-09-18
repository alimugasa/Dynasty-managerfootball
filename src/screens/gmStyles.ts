// The five ways a manager says he sees the job, as the player reads them.
//
// The keys are the server's -- supabase/functions/_shared/api/gmStyles.ts holds
// the list it validates against, and a test asserts these five names match it
// exactly. The labels and the one-line explanations live here because they are
// copy, and copy belongs on the side that renders it.
//
// One line each, and no more. A screen that explains five options in a
// paragraph apiece has stopped being a choice and started being homework.

export const GM_STYLES = [
  {
    key: 'ARCHITECT',
    label: 'Architect',
    detail: 'Long-term roster building.',
  },
  {
    key: 'TALENT_SCOUT',
    label: 'Talent Scout',
    detail: 'Draft and development identity.',
  },
  {
    key: 'NEGOTIATOR',
    label: 'Negotiator',
    detail: 'Contracts and trades.',
  },
  {
    key: 'CULTURE_BUILDER',
    label: 'Culture Builder',
    detail: 'Morale and the locker room.',
  },
  {
    key: 'STRATEGIST',
    label: 'Strategist',
    detail: 'Coaching and gameplan.',
  },
] as const;

export type GmStyleKey = (typeof GM_STYLES)[number]['key'];

/** Where the picker starts. A default the player can see and change, not a
 *  value written behind their back: the choice is optional, and leaving it
 *  alone is itself an answer the save records. */
export const DEFAULT_GM_STYLE: GmStyleKey = 'ARCHITECT';

/** The label for a stored key, or null where the key is one this build does
 *  not know -- a save from a later version, read by an older client. Null so
 *  the caller can say "not recorded" rather than print a raw key. */
export function gmStyleLabel(key: string | null): string | null {
  if (key === null) return null;
  return GM_STYLES.find((s) => s.key === key)?.label ?? null;
}
