// The end of the year: who wins, who is on the ballot, and why.

import { describe, expect, it } from 'vitest';
import {
  AWARD_NAME, BALLOT_DEPTH, runAwards, selectHonours, voterScore,
  type AwardCandidate, type CoachCandidate,
} from '../../supabase/functions/_shared/engine/offseason/awards.ts';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { STARTERS, POSITION_GROUPS } from '../../supabase/functions/_shared/engine/types.ts';

const GAMES = 17;

const candidate = (over: Partial<AwardCandidate> = {}): AwardCandidate => ({
  playerId: 'p1', name: 'A Player', teamId: 'AAA', group: 'WR',
  grade: 70, gradeZ: 0, experience: 4, games: GAMES, teamWins: 9,
  passYards: 0, rushYards: 0, recYards: 0, touchdowns: 0,
  sacks: 0, interceptions: 0, tackles: 0,
  ...over,
});

/** A league of ordinary seasons, so a standout has something to stand out
 *  from and every position has a field. */
function field(): AwardCandidate[] {
  const out: AwardCandidate[] = [];
  let n = 0;
  for (const group of POSITION_GROUPS) {
    for (let i = 0; i < 24; i += 1) {
      n += 1;
      out.push(candidate({
        playerId: `f${String(n)}`, name: `Filler ${String(n)}`, teamId: `T${String(i % 32)}`,
        group, grade: 55 + (i % 12), gradeZ: (i % 12) / 6 - 1,
        experience: i % 9, teamWins: 4 + (i % 10),
      }));
    }
  }
  return out;
}

const coach = (over: Partial<CoachCandidate> = {}): CoachCandidate => ({
  coachId: 'c1', name: 'A Coach', teamId: 'AAA', wins: 9, losses: 8, expectedWins: 9, ...over,
});

describe('what a voter reads', () => {
  it('rates a better season above a worse one at the same position', () => {
    expect(voterScore(candidate({ grade: 92, gradeZ: 2.2 }), GAMES))
      .toBeGreaterThan(voterScore(candidate({ grade: 70, gradeZ: 0 }), GAMES));
  });

  it('will not make a punter the best player in the league', () => {
    const punter = candidate({ group: 'P', grade: 99, gradeZ: 3 });
    const passer = candidate({ group: 'QB', grade: 88, gradeZ: 1.8, passYards: 4600, touchdowns: 34 });
    expect(voterScore(passer, GAMES)).toBeGreaterThan(voterScore(punter, GAMES));
  });

  it('discounts a season half of which was missed', () => {
    const whole = candidate({ grade: 88, games: 17 });
    const half = candidate({ grade: 88, games: 8 });
    expect(voterScore(whole, GAMES)).toBeGreaterThan(voterScore(half, GAMES));
  });

  it('counts winning, but not as much as playing well', () => {
    const goodOnBadTeam = candidate({ grade: 90, gradeZ: 2, teamWins: 3 });
    const averageOnGoodTeam = candidate({ grade: 68, gradeZ: 0.1, teamWins: 15 });
    expect(voterScore(goodOnBadTeam, GAMES)).toBeGreaterThan(voterScore(averageOnGoodTeam, GAMES));
  });
});

describe('a season of votes', () => {
  const candidates = [
    ...field(),
    candidate({
      playerId: 'star', name: 'The Star', teamId: 'AAA', group: 'QB',
      grade: 96, gradeZ: 3.1, passYards: 5100, touchdowns: 44, teamWins: 14, experience: 6,
    }),
    candidate({
      playerId: 'edge', name: 'The Edge', teamId: 'BBB', group: 'EDGE',
      grade: 94, gradeZ: 2.9, sacks: 19, tackles: 70, teamWins: 12, experience: 5,
    }),
    candidate({
      playerId: 'rook', name: 'The Rookie', teamId: 'CCC', group: 'RB',
      grade: 89, gradeZ: 2.4, rushYards: 1600, touchdowns: 15, teamWins: 10, experience: 0,
    }),
  ];
  const coaches = [
    coach({ coachId: 'c1', name: 'Steady', teamId: 'AAA', wins: 14, losses: 3, expectedWins: 13 }),
    coach({ coachId: 'c2', name: 'Overachiever', teamId: 'DDD', wins: 11, losses: 6, expectedWins: 5 }),
    coach({ coachId: 'c3', name: 'Underachiever', teamId: 'EEE', wins: 5, losses: 12, expectedWins: 11 }),
  ];
  const result = runAwards(2027, candidates, coaches, GAMES, createRng(9));

  it('names every award, with a ballot behind each', () => {
    expect(result.awards.map((a) => a.code).sort()).toEqual([
      'COACH_OF_THE_YEAR', 'DEFENSIVE_PLAYER', 'NEWCOMER', 'OFFENSIVE_PLAYER', 'PLAYER_OF_THE_YEAR',
    ]);
    for (const award of result.awards) {
      expect(award.name).toBe(AWARD_NAME[award.code]);
      expect(award.ballot.length).toBeGreaterThan(1);
      expect(award.ballot.length).toBeLessThanOrEqual(BALLOT_DEPTH);
      expect(award.ballot[0]).toEqual(award.winner);
      // Ranks run 1..n and shares sum to the whole vote.
      expect(award.ballot.map((b) => b.rank)).toEqual(award.ballot.map((_, i) => i + 1));
      const total = award.ballot.reduce((a, b) => a + b.voteShare, 0);
      expect(total).toBeGreaterThan(0.95);
      expect(total).toBeLessThan(1.05);
      // The winner led the vote.
      expect(award.winner.voteShare).toBeGreaterThanOrEqual(award.ballot[1]?.voteShare ?? 0);
    }
  });

  it('gives the best season the biggest award', () => {
    const mvp = result.awards.find((a) => a.code === 'PLAYER_OF_THE_YEAR');
    expect(mvp?.winner.playerId).toBe('star');
  });

  it('keeps the two sides of the ball apart', () => {
    expect(result.awards.find((a) => a.code === 'OFFENSIVE_PLAYER')?.winner.playerId).toBe('star');
    expect(result.awards.find((a) => a.code === 'DEFENSIVE_PLAYER')?.winner.playerId).toBe('edge');
  });

  it('gives the newcomer award to someone who has never played before', () => {
    const rookie = result.awards.find((a) => a.code === 'NEWCOMER');
    expect(rookie?.winner.playerId).toBe('rook');
    for (const entry of rookie?.ballot ?? []) {
      const c = candidates.find((x) => x.playerId === entry.playerId);
      expect(c?.experience).toBe(0);
    }
  });

  it('gives the coaching award for beating the roster, not for the record', () => {
    const award = result.awards.find((a) => a.code === 'COACH_OF_THE_YEAR');
    expect(award?.winner.coachId).toBe('c2');
    expect(award?.winner.playerId).toBeNull();
  });

  it('picks two all-league teams that could take the field', () => {
    const first = result.honours.filter((h) => h.team === 'ALL_LEAGUE_FIRST');
    const second = result.honours.filter((h) => h.team === 'ALL_LEAGUE_SECOND');
    for (const group of POSITION_GROUPS) {
      expect(first.filter((h) => h.group === group).length).toBe(STARTERS[group]);
      expect(second.filter((h) => h.group === group).length).toBe(STARTERS[group]);
    }
    // Nobody is on both teams, or on one twice.
    const ids = result.honours.map((h) => h.playerId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.find((h) => h.group === 'QB')?.playerId).toBe('star');
  });

  it('replays exactly from the same seed, and differs from another', () => {
    const again = runAwards(2027, candidates, coaches, GAMES, createRng(9));
    expect(again.awards.map((a) => a.winner.playerId)).toEqual(result.awards.map((a) => a.winner.playerId));
    const other = runAwards(2027, candidates, coaches, GAMES, createRng(10));
    expect(other.awards.length).toBe(result.awards.length);
  });

  it('leaves an award unvoted rather than inventing a winner', () => {
    const noRookies = runAwards(2027, candidates.map((c) => ({ ...c, experience: 3 })), [], GAMES, createRng(1));
    expect(noRookies.awards.find((a) => a.code === 'NEWCOMER')).toBeUndefined();
    expect(noRookies.awards.find((a) => a.code === 'COACH_OF_THE_YEAR')).toBeUndefined();
  });

  it('keeps a player who barely played off the all-league team', () => {
    const hurt = candidate({
      playerId: 'hurt', name: 'Hurt', group: 'TE', grade: 99, gradeZ: 3.5, games: 3,
    });
    const honours = selectHonours([...candidates, hurt], GAMES);
    expect(honours.some((h) => h.playerId === 'hurt')).toBe(false);
  });
});
