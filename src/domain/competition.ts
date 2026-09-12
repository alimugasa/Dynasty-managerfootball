// Regular-season and playoff production are separate records that must never be
// silently summed. A 17-game regular season and a 4-game playoff run are
// different facts. This is enforced by the type system, not by discipline.

export const COMPETITIONS = ['REGULAR_SEASON', 'PLAYOFFS'] as const;
export type Competition = (typeof COMPETITIONS)[number];

/** Holds one value per competition. Deliberately has NO combined field. */
export interface CompetitionSplit<T> {
  REGULAR_SEASON: T;
  PLAYOFFS: T;
}

export function forCompetition<T>(split: CompetitionSplit<T>, c: Competition): T {
  return split[c];
}

/** Every aggregate must state which competition it means. There is no overload
 *  that omits the argument, so a caller cannot forget to decide. */
export function aggregate<T, R>(
  rows: readonly T[],
  competition: Competition,
  competitionOf: (row: T) => Competition,
  reducer: (acc: R, row: T) => R,
  initial: R,
): R {
  return rows.filter((r) => competitionOf(r) === competition).reduce(reducer, initial);
}

export const COMPETITION_LABEL: Record<Competition, string> = {
  REGULAR_SEASON: 'REGULAR SEASON',
  PLAYOFFS: 'PLAYOFFS',
};

/**
 * What the tables call these. The database stores REGULAR and PLAYOFF; the
 * domain names them in full because a screen label has room to. One mapping,
 * here, so that no screen invents its own spelling of a wire value.
 */
export const COMPETITION_PARAM: Record<Competition, 'REGULAR' | 'PLAYOFF'> = {
  REGULAR_SEASON: 'REGULAR',
  PLAYOFFS: 'PLAYOFF',
};
