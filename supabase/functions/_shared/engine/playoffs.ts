// The postseason: who qualifies, in what order, and who plays whom.
//
// Fourteen clubs, seven from each conference: the four division winners
// seeded one to four by record, then the three best of the rest at five to
// seven. The top seed sits out the opening round. Every round re-seeds --
// the best surviving seed meets the worst -- and the higher seed hosts until
// the final, which is played on neutral ground between the two conference
// champions. One loss and a club is out.
//
// Ties on record are broken in one fixed order: the games between the tied
// clubs, then division record, then conference record, then point
// differential, then a coin drawn from the season's own stream, so the same
// season breaks the same tie the same way every time it is loaded.
//
// Pure. Takes records and results, returns seeds and fixtures; the caller
// stores them. Nothing here reads a clock or a table.

import type { Rng } from './rng.ts';

export interface ClubRecord {
  readonly teamId: string;
  readonly conferenceId: string;
  readonly divisionId: string;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly divisionWins: number;
  readonly divisionLosses: number;
  readonly divisionTies: number;
  readonly conferenceWins: number;
  readonly conferenceLosses: number;
  readonly conferenceTies: number;
}

/** A regular-season result, for head-to-head. */
export interface Result {
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeScore: number;
  readonly awayScore: number;
}

export interface Seed {
  readonly teamId: string;
  readonly conferenceId: string;
  /** 1-7 within the conference. */
  readonly seed: number;
  readonly divisionWinner: boolean;
}

/** The four rounds, in order. Original names: the league's own. */
export const PLAYOFF_ROUNDS = ['OPENING', 'QUARTERFINAL', 'CONFERENCE_FINAL', 'LEAGUE_FINAL'] as const;
export type PlayoffRound = (typeof PLAYOFF_ROUNDS)[number];

export const ROUND_LABEL: Readonly<Record<PlayoffRound, string>> = {
  OPENING: 'Opening Round',
  QUARTERFINAL: 'Quarterfinals',
  CONFERENCE_FINAL: 'Conference Final',
  LEAGUE_FINAL: 'League Final',
};

/** How far a club got, for the record. */
export type PlayoffOutcome = 'MISSED' | PlayoffRound | 'RUNNER_UP' | 'CHAMPION';

export interface PlayoffFixture {
  readonly round: PlayoffRound;
  /** Hosts, or the better seed at a neutral site. */
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly neutralSite: boolean;
}

export interface PlayoffResult extends PlayoffFixture {
  readonly homeScore: number;
  readonly awayScore: number;
}

export const QUALIFIERS_PER_CONFERENCE = 7;
export const DIVISION_WINNERS_PER_CONFERENCE = 4;

const pct = (w: number, l: number, t: number): number => {
  const games = w + l + t;
  return games === 0 ? 0 : (w + t / 2) / games;
};

type Criterion = (club: ClubRecord, tied: readonly ClubRecord[], results: readonly Result[]) => number;

/** Record in the games played among the tied clubs only. */
const headToHead: Criterion = (club, tied, results) => {
  const others = new Set(tied.filter((t) => t.teamId !== club.teamId).map((t) => t.teamId));
  let w = 0; let l = 0; let t = 0;
  for (const r of results) {
    const home = r.homeTeamId === club.teamId && others.has(r.awayTeamId);
    const away = r.awayTeamId === club.teamId && others.has(r.homeTeamId);
    if (!home && !away) continue;
    const mine = home ? r.homeScore : r.awayScore;
    const theirs = home ? r.awayScore : r.homeScore;
    if (mine > theirs) w += 1; else if (mine < theirs) l += 1; else t += 1;
  }
  return pct(w, l, t);
};
const divisionRecord: Criterion = (c) => pct(c.divisionWins, c.divisionLosses, c.divisionTies);
const conferenceRecord: Criterion = (c) => pct(c.conferenceWins, c.conferenceLosses, c.conferenceTies);
const pointDifferential: Criterion = (c) => c.pointsFor - c.pointsAgainst;

/** The tiebreakers, in the order they are applied. Exported so a test can
 *  name the tier it is constructing. */
export const TIEBREAKERS: readonly { readonly name: string; readonly value: Criterion }[] = [
  { name: 'head-to-head', value: headToHead },
  { name: 'division record', value: divisionRecord },
  { name: 'conference record', value: conferenceRecord },
  { name: 'point differential', value: pointDifferential },
];

/** Splits a group by a criterion, best first; each sub-group is tied on it. */
function splitBy(group: readonly ClubRecord[], value: (c: ClubRecord) => number): ClubRecord[][] {
  const byValue = new Map<number, ClubRecord[]>();
  for (const c of group) {
    const v = value(c);
    byValue.set(v, [...(byValue.get(v) ?? []), c]);
  }
  return [...byValue.entries()].sort((a, b) => b[0] - a[0]).map(([, clubs]) => clubs);
}

/** Orders clubs tied on record, applying each tier to the still-tied set. */
function breakTie(
  tied: readonly ClubRecord[], results: readonly Result[], rng: Rng, tier = 0,
): ClubRecord[] {
  if (tied.length <= 1) return [...tied];
  const criterion = TIEBREAKERS[tier];
  if (criterion === undefined) {
    // Nothing separates them: a coin, from the season's stream. Shuffled as a
    // group so a three-way tie draws once per pair rather than favouring
    // whoever was listed first.
    const order = [...tied];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = rng.int(0, i);
      const a = order[i]; const b = order[j];
      if (a !== undefined && b !== undefined) { order[i] = b; order[j] = a; }
    }
    return order;
  }
  return splitBy(tied, (c) => criterion.value(c, tied, results))
    .flatMap((group) => (group.length === tied.length
      ? breakTie(group, results, rng, tier + 1)
      : breakTie(group, results, rng, 0)));
}

/** Clubs in order, best first, ties broken. */
export function rankClubs(
  clubs: readonly ClubRecord[], results: readonly Result[], rng: Rng,
): ClubRecord[] {
  return splitBy(clubs, (c) => pct(c.wins, c.losses, c.ties))
    .flatMap((tied) => breakTie(tied, results, rng));
}

/** Seven seeds per conference. */
export function seedConference(
  clubs: readonly ClubRecord[], results: readonly Result[], rng: Rng,
): Seed[] {
  const byDivision = new Map<string, ClubRecord[]>();
  for (const c of clubs) byDivision.set(c.divisionId, [...(byDivision.get(c.divisionId) ?? []), c]);
  if (byDivision.size !== DIVISION_WINNERS_PER_CONFERENCE) {
    throw new Error(
      `A conference has ${String(byDivision.size)} divisions; the bracket needs ${String(DIVISION_WINNERS_PER_CONFERENCE)}`);
  }
  const winners = [...byDivision.values()].map((d) => rankClubs(d, results, rng)[0])
    .filter((c): c is ClubRecord => c !== undefined);
  const winnerIds = new Set(winners.map((c) => c.teamId));
  const rest = clubs.filter((c) => !winnerIds.has(c.teamId));
  const top = rankClubs(winners, results, rng);
  const wild = rankClubs(rest, results, rng).slice(0, QUALIFIERS_PER_CONFERENCE - top.length);
  return [...top, ...wild].map((c, i) => ({
    teamId: c.teamId, conferenceId: c.conferenceId, seed: i + 1, divisionWinner: i < top.length,
  }));
}

export function seedLeague(
  clubs: readonly ClubRecord[], results: readonly Result[], rng: Rng,
): Seed[] {
  const conferences = [...new Set(clubs.map((c) => c.conferenceId))].sort();
  if (conferences.length !== 2) {
    throw new Error(`The bracket needs two conferences, not ${String(conferences.length)}`);
  }
  return conferences.flatMap((conf) =>
    seedConference(clubs.filter((c) => c.conferenceId === conf), results, rng));
}

const winnerOf = (r: PlayoffResult): string => (r.homeScore > r.awayScore ? r.homeTeamId : r.awayTeamId);

/** Best seed hosts; pairs best against worst. */
function pair(alive: readonly Seed[], round: PlayoffRound): PlayoffFixture[] {
  const sorted = [...alive].sort((a, b) => a.seed - b.seed);
  const out: PlayoffFixture[] = [];
  for (let i = 0; i < Math.floor(sorted.length / 2); i += 1) {
    const high = sorted[i]; const low = sorted[sorted.length - 1 - i];
    if (high === undefined || low === undefined) continue;
    out.push({ round, homeTeamId: high.teamId, awayTeamId: low.teamId, neutralSite: false });
  }
  return out;
}

export interface BracketState {
  readonly round: PlayoffRound | null;
  /** Fixtures still to play in `round`; empty when the bracket is done. */
  readonly fixtures: readonly PlayoffFixture[];
  readonly champion: string | null;
}

/**
 * Where the bracket stands: the next round's fixtures, or the champion.
 * Derived every time from the seeds and the results so far, so there is no
 * bracket to keep in step with the games.
 */
export function bracket(seeds: readonly Seed[], played: readonly PlayoffResult[]): BracketState {
  const byConf = new Map<string, Seed[]>();
  for (const s of seeds) byConf.set(s.conferenceId, [...(byConf.get(s.conferenceId) ?? []), s]);
  const seedOf = new Map(seeds.map((s) => [s.teamId, s]));
  const survivorsAfter = (round: PlayoffRound, conf: string): Seed[] => {
    const results = played.filter((r) => r.round === round);
    const winners = results.map(winnerOf).map((id) => seedOf.get(id))
      .filter((s): s is Seed => s !== undefined && s.conferenceId === conf);
    return winners;
  };

  const opening = played.filter((r) => r.round === 'OPENING');
  const quarter = played.filter((r) => r.round === 'QUARTERFINAL');
  const confFinal = played.filter((r) => r.round === 'CONFERENCE_FINAL');
  const final = played.find((r) => r.round === 'LEAGUE_FINAL');

  if (final !== undefined) return { round: null, fixtures: [], champion: winnerOf(final) };

  const confs = [...byConf.keys()].sort();
  if (opening.length < confs.length * 3) {
    const fixtures = confs.flatMap((conf) => pair(
      (byConf.get(conf) ?? []).filter((s) => s.seed >= 2), 'OPENING'));
    return { round: 'OPENING', fixtures: fixtures.filter((f) => !opening.some((r) => r.homeTeamId === f.homeTeamId)), champion: null };
  }
  if (quarter.length < confs.length * 2) {
    const fixtures = confs.flatMap((conf) => pair([
      ...(byConf.get(conf) ?? []).filter((s) => s.seed === 1),
      ...survivorsAfter('OPENING', conf),
    ], 'QUARTERFINAL'));
    return { round: 'QUARTERFINAL', fixtures, champion: null };
  }
  if (confFinal.length < confs.length) {
    const fixtures = confs.flatMap((conf) => pair(survivorsAfter('QUARTERFINAL', conf), 'CONFERENCE_FINAL'));
    return { round: 'CONFERENCE_FINAL', fixtures, champion: null };
  }
  const champions = confs.map((conf) => survivorsAfter('CONFERENCE_FINAL', conf)[0])
    .filter((s): s is Seed => s !== undefined)
    .sort((a, b) => a.seed - b.seed || a.conferenceId.localeCompare(b.conferenceId));
  const [a, b] = champions;
  if (a === undefined || b === undefined) throw new Error('A conference has no champion to send to the final');
  return {
    round: 'LEAGUE_FINAL',
    fixtures: [{ round: 'LEAGUE_FINAL', homeTeamId: a.teamId, awayTeamId: b.teamId, neutralSite: true }],
    champion: null,
  };
}

/** How each club's postseason ended, once the bracket is done. */
export function outcomes(
  seeds: readonly Seed[], played: readonly PlayoffResult[], allTeamIds: readonly string[],
): Map<string, PlayoffOutcome> {
  const out = new Map<string, PlayoffOutcome>(allTeamIds.map((id) => [id, 'MISSED']));
  const reached = (teamId: string): PlayoffRound => {
    let furthest: PlayoffRound = 'QUARTERFINAL';
    const s = seeds.find((x) => x.teamId === teamId);
    if (s !== undefined && s.seed >= 2) furthest = 'OPENING';
    for (const r of played) {
      if (r.homeTeamId !== teamId && r.awayTeamId !== teamId) continue;
      if (PLAYOFF_ROUNDS.indexOf(r.round) > PLAYOFF_ROUNDS.indexOf(furthest)) furthest = r.round;
    }
    return furthest;
  };
  for (const s of seeds) out.set(s.teamId, reached(s.teamId));
  const final = played.find((r) => r.round === 'LEAGUE_FINAL');
  if (final !== undefined) {
    const champion = winnerOf(final);
    out.set(champion, 'CHAMPION');
    out.set(champion === final.homeTeamId ? final.awayTeamId : final.homeTeamId, 'RUNNER_UP');
  }
  return out;
}
