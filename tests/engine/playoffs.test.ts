// The postseason: who gets in, in what order, and who plays whom.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  bracket, outcomes, rankClubs, seedLeague, TIEBREAKERS,
  type ClubRecord, type PlayoffResult, type Result, type Seed,
} from '../../supabase/functions/_shared/engine/playoffs.ts';
import { buildSchedule } from '../../supabase/functions/_shared/engine/season.ts';
import { simulateGame } from '../../supabase/functions/_shared/engine/simulateGame.ts';
import { teamStatesFor } from '../../supabase/functions/_shared/engine/careerBridge.ts';
import { primePipeline, runOffseason } from '../../supabase/functions/_shared/engine/offseason/population.ts';
import { loadCareerLeague } from '../../scripts/drift-report/careerLeague.ts';
import { readSeedCsv } from '../../scripts/lib/seedCsv.ts';

const club = (teamId: string, over: Partial<ClubRecord> = {}): ClubRecord => ({
  teamId, conferenceId: 'AC', divisionId: 'AC-E',
  wins: 10, losses: 7, ties: 0, pointsFor: 400, pointsAgainst: 350,
  divisionWins: 4, divisionLosses: 2, divisionTies: 0,
  conferenceWins: 8, conferenceLosses: 4, conferenceTies: 0,
  ...over,
});
const game = (home: string, away: string, hs: number, as: number): Result =>
  ({ homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as });
const order = (clubs: readonly ClubRecord[], results: readonly Result[] = [], seed = 1): string[] =>
  rankClubs(clubs, results, createRng(seed)).map((c) => c.teamId);

describe('tiebreakers, one tier at a time', () => {
  it('record first: a better record beats every tiebreaker', () => {
    const a = club('A', { wins: 11, losses: 6, pointsFor: 300, pointsAgainst: 400 });
    const b = club('B', { wins: 10, losses: 7, pointsFor: 500, pointsAgainst: 200 });
    expect(order([b, a], [game('B', 'A', 30, 3)])).toEqual(['A', 'B']);
  });

  it('tier 1, head-to-head: the club that won the meeting goes first', () => {
    expect(TIEBREAKERS[0]?.name).toBe('head-to-head');
    const a = club('A'); const b = club('B', { pointsFor: 600 });
    expect(order([b, a], [game('A', 'B', 24, 20)])).toEqual(['A', 'B']);
    expect(order([b, a], [game('A', 'B', 20, 24)])).toEqual(['B', 'A']);
  });

  it('tier 2, division record: decides when the clubs split their meetings', () => {
    expect(TIEBREAKERS[1]?.name).toBe('division record');
    const a = club('A', { divisionWins: 5, divisionLosses: 1 });
    const b = club('B', { divisionWins: 3, divisionLosses: 3, pointsFor: 600 });
    const split = [game('A', 'B', 20, 17), game('B', 'A', 20, 17)];
    expect(order([b, a], split)).toEqual(['A', 'B']);
  });

  it('tier 3, conference record: decides when division records match too', () => {
    expect(TIEBREAKERS[2]?.name).toBe('conference record');
    const a = club('A', { conferenceWins: 9, conferenceLosses: 3 });
    const b = club('B', { conferenceWins: 7, conferenceLosses: 5, pointsFor: 600 });
    expect(order([b, a])).toEqual(['A', 'B']);
  });

  it('tier 4, point differential: decides when the records all match', () => {
    expect(TIEBREAKERS[3]?.name).toBe('point differential');
    const a = club('A', { pointsFor: 420, pointsAgainst: 300 });
    const b = club('B', { pointsFor: 400, pointsAgainst: 350 });
    expect(order([b, a])).toEqual(['A', 'B']);
  });

  it('tier 5, the coin: deterministic for the seed, and not always the first-listed club', () => {
    const a = club('A'); const b = club('B');
    const flips = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const once = order([a, b], [], seed);
      expect(order([a, b], [], seed)).toEqual(once);
      flips.add(once[0] ?? '');
    }
    expect(flips).toEqual(new Set(['A', 'B']));
  });

  it('a three-way tie applies head-to-head among the three, then restarts the tiers', () => {
    const a = club('A'); const b = club('B'); const c = club('C', { pointsFor: 999 });
    // A beat both; B and C split, so B v C falls to division record.
    const results = [game('A', 'B', 21, 7), game('A', 'C', 21, 7), game('B', 'C', 21, 7), game('C', 'B', 21, 7)];
    const bDiv = { ...b, divisionWins: 5, divisionLosses: 1 };
    expect(order([c, bDiv, a], results)).toEqual(['A', 'B', 'C']);
  });
});

/** A 32-club league with four divisions a conference, records by rank. */
function league(records: (i: number) => Partial<ClubRecord>): ClubRecord[] {
  const out: ClubRecord[] = [];
  for (let i = 0; i < 32; i += 1) {
    const conf = i < 16 ? 'AC' : 'NC';
    const div = `${conf}-${String(Math.floor((i % 16) / 4))}`;
    out.push(club(`T${String(i).padStart(2, '0')}`, {
      conferenceId: conf, divisionId: div, wins: 17 - (i % 16), losses: i % 16, ...records(i),
    }));
  }
  return out;
}

describe('seeding', () => {
  it('takes four division winners at 1-4 and three others at 5-7, per conference', () => {
    // Division 0 holds the four best records in the conference; only one of
    // them may be a division winner, so the other three take the wild seeds.
    const seeds = seedLeague(league(() => ({})), [], createRng(1));
    expect(seeds.length).toBe(14);
    for (const conf of ['AC', 'NC']) {
      const mine = seeds.filter((s) => s.conferenceId === conf).sort((a, b) => a.seed - b.seed);
      expect(mine.map((s) => s.seed)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(mine.slice(0, 4).every((s) => s.divisionWinner)).toBe(true);
      expect(mine.slice(4).every((s) => !s.divisionWinner)).toBe(true);
      expect(new Set(mine.slice(0, 4).map((s) => s.teamId.slice(0, 1)))).toBeDefined();
    }
    const ac = seeds.filter((s) => s.conferenceId === 'AC');
    expect(ac.find((s) => s.seed === 1)?.teamId).toBe('T00');
    expect(ac.filter((s) => !s.divisionWinner).map((s) => s.teamId)).toEqual(['T01', 'T02', 'T03']);
  });
});

/** Plays a bracket to the end with the higher seed always winning. */
function playChalk(seeds: readonly Seed[]): PlayoffResult[] {
  const played: PlayoffResult[] = [];
  for (let guard = 0; guard < 5; guard += 1) {
    const state = bracket(seeds, played);
    if (state.champion !== null) break;
    for (const f of state.fixtures) {
      const home = seeds.find((s) => s.teamId === f.homeTeamId)?.seed ?? 9;
      const away = seeds.find((s) => s.teamId === f.awayTeamId)?.seed ?? 9;
      const homeWins = home <= away;
      played.push({ ...f, homeScore: homeWins ? 24 : 17, awayScore: homeWins ? 17 : 24 });
    }
  }
  return played;
}

describe('the bracket', () => {
  const seeds = seedLeague(league(() => ({})), [], createRng(1));

  it('opens 2v7, 3v6, 4v5 with the top seed resting, higher seed at home', () => {
    const state = bracket(seeds, []);
    expect(state.round).toBe('OPENING');
    expect(state.fixtures.length).toBe(6);
    for (const conf of ['AC', 'NC']) {
      const s = (n: number): string => seeds.find((x) => x.conferenceId === conf && x.seed === n)?.teamId ?? '';
      const mine = state.fixtures.filter((f) =>
        seeds.find((x) => x.teamId === f.homeTeamId)?.conferenceId === conf);
      expect(mine.map((f) => `${f.homeTeamId}v${f.awayTeamId}`).sort())
        .toEqual([`${s(2)}v${s(7)}`, `${s(3)}v${s(6)}`, `${s(4)}v${s(5)}`].sort());
      expect(mine.every((f) => !f.neutralSite)).toBe(true);
    }
  });

  it('re-seeds every round and ends with a neutral final between the conference champions', () => {
    const played = playChalk(seeds);
    const rounds = played.map((r) => r.round);
    expect(rounds.filter((r) => r === 'OPENING').length).toBe(6);
    expect(rounds.filter((r) => r === 'QUARTERFINAL').length).toBe(4);
    expect(rounds.filter((r) => r === 'CONFERENCE_FINAL').length).toBe(2);
    expect(rounds.filter((r) => r === 'LEAGUE_FINAL').length).toBe(1);
    // Chalk: the quarterfinal is 1v4 and 2v3 in each conference.
    const quarter = played.filter((r) => r.round === 'QUARTERFINAL');
    const seedOf = (id: string): number => seeds.find((s) => s.teamId === id)?.seed ?? 0;
    expect(quarter.map((r) => `${String(seedOf(r.homeTeamId))}v${String(seedOf(r.awayTeamId))}`).sort())
      .toEqual(['1v4', '1v4', '2v3', '2v3']);
    const final = played.find((r) => r.round === 'LEAGUE_FINAL');
    expect(final?.neutralSite).toBe(true);
    expect(new Set([
      seeds.find((s) => s.teamId === final?.homeTeamId)?.conferenceId,
      seeds.find((s) => s.teamId === final?.awayTeamId)?.conferenceId,
    ])).toEqual(new Set(['AC', 'NC']));
    expect(bracket(seeds, played).champion).toBe('T00');
  });

  it('records how far every club went', () => {
    const played = playChalk(seeds);
    const all = league(() => ({})).map((c) => c.teamId);
    const out = outcomes(seeds, played, all);
    expect(out.get('T00')).toBe('CHAMPION');
    expect(out.get('T16')).toBe('RUNNER_UP');
    expect(out.get('T15')).toBe('MISSED');
    expect([...out.values()].filter((o) => o === 'CHAMPION').length).toBe(1);
    expect([...out.values()].filter((o) => o === 'MISSED').length).toBe(18);
  });
});

describe('twenty seasons of real football', () => {
  it('crowns exactly one champion a year, and no club appears twice in a bracket', { timeout: 600_000 }, () => {
    const teams = readSeedCsv('teams');
    const confOf = new Map(teams.map((t) => [t['team_id'] ?? '', t['conference_id'] ?? '']));
    const divOf = new Map(teams.map((t) => [t['team_id'] ?? '', t['division_id'] ?? '']));
    const league = loadCareerLeague();
    const rng = createRng(2026);
    primePipeline(league, rng);
    const champions: string[] = [];

    for (let year = 0; year < 20; year += 1) {
      const states = teamStatesFor(league.teamIds, league.players, { fronts: league.fronts });
      const results: Result[] = [];
      const rec = new Map<string, ClubRecord>(league.teamIds.map((id) => [id, club(id, {
        conferenceId: confOf.get(id) ?? '', divisionId: divOf.get(id) ?? '',
        wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
        divisionWins: 0, divisionLosses: 0, divisionTies: 0,
        conferenceWins: 0, conferenceLosses: 0, conferenceTies: 0,
      })]));
      const credit = (id: string, opp: string, pf: number, pa: number): void => {
        const r = rec.get(id); if (r === undefined) return;
        const w = pf > pa ? 1 : 0; const l = pf < pa ? 1 : 0; const t = pf === pa ? 1 : 0;
        const sameDiv = divOf.get(id) === divOf.get(opp); const sameConf = confOf.get(id) === confOf.get(opp);
        rec.set(id, {
          ...r, wins: r.wins + w, losses: r.losses + l, ties: r.ties + t,
          pointsFor: r.pointsFor + pf, pointsAgainst: r.pointsAgainst + pa,
          divisionWins: r.divisionWins + (sameDiv ? w : 0), divisionLosses: r.divisionLosses + (sameDiv ? l : 0),
          divisionTies: r.divisionTies + (sameDiv ? t : 0),
          conferenceWins: r.conferenceWins + (sameConf ? w : 0), conferenceLosses: r.conferenceLosses + (sameConf ? l : 0),
          conferenceTies: r.conferenceTies + (sameConf ? t : 0),
        });
      };
      for (const f of buildSchedule(league.teamIds, 17)) {
        const home = states.get(f.homeTeamId); const away = states.get(f.awayTeamId);
        if (home === undefined || away === undefined) continue;
        const g = simulateGame(home, away, rng, { allowTie: true });
        results.push(game(f.homeTeamId, f.awayTeamId, g.homeScore, g.awayScore));
        credit(f.homeTeamId, f.awayTeamId, g.homeScore, g.awayScore);
        credit(f.awayTeamId, f.homeTeamId, g.awayScore, g.homeScore);
      }

      const seeds = seedLeague([...rec.values()], results, rng);
      const played: PlayoffResult[] = [];
      const appearances = new Map<string, number>();
      for (let guard = 0; guard < 5; guard += 1) {
        const state = bracket(seeds, played);
        if (state.champion !== null) { champions.push(state.champion); break; }
        for (const f of state.fixtures) {
          const home = states.get(f.homeTeamId); const away = states.get(f.awayTeamId);
          if (home === undefined || away === undefined) throw new Error('bracket names an unknown club');
          const g = simulateGame(home, away, rng, { allowTie: false, neutralSite: f.neutralSite });
          expect(g.homeScore).not.toBe(g.awayScore);
          played.push({ ...f, homeScore: g.homeScore, awayScore: g.awayScore });
          for (const id of [f.homeTeamId, f.awayTeamId]) {
            appearances.set(`${f.round}:${id}`, (appearances.get(`${f.round}:${id}`) ?? 0) + 1);
          }
        }
      }
      expect([...appearances.values()].every((n) => n === 1)).toBe(true);
      expect(played.length).toBe(13);
      expect(new Set(seeds.map((s) => s.teamId)).size).toBe(14);
      runOffseason(league, rng);
    }
    expect(champions.length).toBe(20);
    expect(champions.every((c) => league.teamIds.includes(c))).toBe(true);
  });
});
