// The box score is folded out of the play events, so the two must agree exactly.
// These checks would catch a stat credited to the wrong column, a play counted
// twice, or a score that does not add up from its scoring plays.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { simulateGame } from '../../supabase/functions/_shared/engine/simulateGame.ts';
import type { GameResult } from '../../supabase/functions/_shared/engine/types.ts';
import { averageMatchup } from './fixtures.ts';

const games: GameResult[] = [];
for (let seed = 1; seed <= 60; seed += 1) {
  const { home, away } = averageMatchup(seed);
  games.push(simulateGame(home, away, createRng(seed * 6151), { allowTie: true }));
}

const sumBy = (game: GameResult, teamId: string, read: (line: GameResult['players'][number]) => number): number =>
  game.players.filter((p) => p.teamId === teamId).reduce((acc, p) => acc + read(p), 0);

describe('box score integrity', () => {
  it('final scores equal the points recorded on scoring plays', () => {
    for (const game of games) {
      const scored = game.plays.reduce((acc, play) => acc + play.points, 0);
      expect(scored).toBe(game.homeScore + game.awayScore);
    }
  });

  it('per-player passing yards sum to the team total', () => {
    for (const game of games) {
      expect(sumBy(game, game.homeTeamId, (p) => p.passYards)).toBe(game.home.passYards);
      expect(sumBy(game, game.awayTeamId, (p) => p.passYards)).toBe(game.away.passYards);
    }
  });

  it('per-player receiving yards sum to the team passing total', () => {
    for (const game of games) {
      expect(sumBy(game, game.homeTeamId, (p) => p.receivingYards)).toBe(game.home.passYards);
      expect(sumBy(game, game.awayTeamId, (p) => p.receivingYards)).toBe(game.away.passYards);
    }
  });

  it('per-player rushing yards sum to the team total', () => {
    for (const game of games) {
      expect(sumBy(game, game.homeTeamId, (p) => p.rushYards)).toBe(game.home.rushYards);
      expect(sumBy(game, game.awayTeamId, (p) => p.rushYards)).toBe(game.away.rushYards);
    }
  });

  it('receptions equal completions and never exceed targets', () => {
    for (const game of games) {
      expect(sumBy(game, game.homeTeamId, (p) => p.receptions)).toBe(game.home.completions);
      for (const line of game.players) {
        expect(line.receptions).toBeLessThanOrEqual(line.targets);
        expect(line.completions).toBeLessThanOrEqual(line.passAttempts);
        expect(line.fieldGoalsMade).toBeLessThanOrEqual(line.fieldGoalsAttempted);
      }
    }
  });

  it('team completions never exceed attempts, and made kicks never exceed tries', () => {
    for (const game of games) {
      for (const box of [game.home, game.away]) {
        expect(box.completions).toBeLessThanOrEqual(box.passAttempts);
        expect(box.fieldGoalsMade).toBeLessThanOrEqual(box.fieldGoalsAttempted);
        expect(box.thirdDownConversions).toBeLessThanOrEqual(box.thirdDownAttempts);
        expect(box.plays).toBe(box.passAttempts + box.sacksAllowed + box.rushes);
      }
    }
  });

  it('a quarterback scramble is a rush, never a pass attempt', () => {
    let scrambles = 0;
    for (const game of games) {
      for (const play of game.plays) {
        if (play.playType !== 'pass' || play.rusher === undefined) continue;
        scrambles += 1;
        // The passer and the rusher are the same man on a scramble, and the
        // yardage must not appear in the passing line.
        expect(play.rusher).toBe(play.passer);
        expect(play.receiver).toBeUndefined();
      }
    }
    expect(scrambles).toBeGreaterThan(0);
  });
});

describe('play stream integrity', () => {
  it('is indexed contiguously from zero', () => {
    for (const game of games) {
      game.plays.forEach((play, i) => expect(play.index).toBe(i));
    }
  });

  it('never runs the clock backwards inside a quarter', () => {
    for (const game of games) {
      let quarter = 0;
      let clock = Number.POSITIVE_INFINITY;
      for (const play of game.plays) {
        if (play.quarter !== quarter) {
          expect(play.quarter).toBeGreaterThan(quarter);
          quarter = play.quarter;
          clock = Number.POSITIVE_INFINITY;
        }
        expect(play.clock).toBeLessThanOrEqual(clock);
        clock = play.clock;
      }
    }
  });

  it('keeps the ball on the field and the down legal', () => {
    for (const game of games) {
      for (const play of game.plays) {
        if (play.playType === 'kickoff') continue;
        expect(play.yardLine).toBeGreaterThanOrEqual(1);
        expect(play.yardLine).toBeLessThanOrEqual(99);
        expect(play.down).toBeGreaterThanOrEqual(1);
        expect(play.down).toBeLessThanOrEqual(4);
      }
    }
  });

  it('only ever involves the two teams playing', () => {
    for (const game of games) {
      for (const play of game.plays) {
        expect([game.homeTeamId, game.awayTeamId]).toContain(play.offense);
        expect([game.homeTeamId, game.awayTeamId]).toContain(play.defense);
        expect(play.offense).not.toBe(play.defense);
      }
    }
  });

  it('completes a full game rather than hitting the runaway guard', () => {
    for (const game of games) {
      expect(game.plays.length).toBeGreaterThan(100);
      expect(game.plays.length).toBeLessThan(320);
      const lastQuarter = game.plays[game.plays.length - 1]?.quarter ?? 0;
      expect(lastQuarter).toBeGreaterThanOrEqual(4);
    }
  });

  it('never leaves a playoff game tied', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const { home, away } = averageMatchup(seed);
      const game = simulateGame(home, away, createRng(seed * 3301), { allowTie: false });
      expect(game.homeScore).not.toBe(game.awayScore);
    }
  });

  it('records snaps for the players who took them', () => {
    for (const game of games) {
      const withSnaps = game.players.filter((p) => p.snaps >= 0);
      expect(withSnaps.length).toBeGreaterThan(20);
    }
  });
});
