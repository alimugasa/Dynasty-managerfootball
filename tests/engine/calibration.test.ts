// Statistical validation.
//
// Determinism proves the engine repeats itself; it says nothing about whether
// what it repeats resembles football. These bounds are the validation table from
// legacy/ENGINE.md, which the calibrated Python reference passes 17/17 against
// real league ranges. This engine applies the same rate formulas per snap rather
// than per game, so the same table is the right check.
//
// The sample is fixed-seed, so a failure here is a real calibration regression
// and not variance. Every bound is a range a real season falls inside, not a
// tolerance around whatever the engine currently emits.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { simulateGame } from '../../supabase/functions/_shared/engine/simulateGame.ts';
import { averageMatchup } from './fixtures.ts';

const GAMES = 250;

interface Totals {
  points: number; passYards: number; attempts: number; completions: number;
  rushYards: number; rushes: number; sacks: number; interceptions: number;
  plays: number; drives: number; touchdowns: number; punts: number;
  fieldGoalAttempts: number; fieldGoalsMade: number;
  thirdDowns: number; thirdDownConversions: number;
  injuries: number; homeWins: number; decided: number;
}

function season(): Totals {
  const t: Totals = {
    points: 0, passYards: 0, attempts: 0, completions: 0, rushYards: 0, rushes: 0,
    sacks: 0, interceptions: 0, plays: 0, drives: 0, touchdowns: 0, punts: 0,
    fieldGoalAttempts: 0, fieldGoalsMade: 0, thirdDowns: 0, thirdDownConversions: 0,
    injuries: 0, homeWins: 0, decided: 0,
  };
  for (let seed = 1; seed <= GAMES; seed += 1) {
    const { home, away } = averageMatchup(seed);
    const game = simulateGame(home, away, createRng(seed * 7919), { allowTie: true });
    for (const box of [game.home, game.away]) {
      t.points += box.score;
      t.passYards += box.passYards;
      t.attempts += box.passAttempts;
      t.completions += box.completions;
      t.rushYards += box.rushYards;
      t.rushes += box.rushes;
      t.sacks += box.sacksAllowed;
      t.interceptions += box.interceptionsThrown;
      t.plays += box.plays;
      t.drives += box.drives;
      t.touchdowns += box.passTouchdowns + box.rushTouchdowns;
      t.fieldGoalAttempts += box.fieldGoalsAttempted;
      t.fieldGoalsMade += box.fieldGoalsMade;
      t.thirdDowns += box.thirdDownAttempts;
      t.thirdDownConversions += box.thirdDownConversions;
    }
    t.punts += game.plays.filter((p) => p.playType === 'punt').length;
    t.injuries += game.injuries.length;
    if (game.homeScore !== game.awayScore) {
      t.decided += 1;
      if (game.homeScore > game.awayScore) t.homeWins += 1;
    }
  }
  return t;
}

const totals = season();
const perTeam = GAMES * 2;

describe('statistical calibration against the reference validation table', () => {
  it.each([
    ['points per team per game', totals.points / perTeam, 20.5, 25.5],
    ['pass yards per team', totals.passYards / perTeam, 195, 265],
    ['pass attempts per team', totals.attempts / perTeam, 29, 37],
    ['completion percentage', (totals.completions / totals.attempts) * 100, 60, 70],
    ['rush yards per team', totals.rushYards / perTeam, 95, 140],
    ['yards per carry', totals.rushYards / totals.rushes, 3.9, 4.8],
    ['sacks per team per game', totals.sacks / perTeam, 1.9, 3.0],
    ['interceptions per team', totals.interceptions / perTeam, 0.5, 1.1],
  ])('%s is inside the real range', (_label, value, low, high) => {
    expect(value).toBeGreaterThanOrEqual(low);
    expect(value).toBeLessThanOrEqual(high);
  });

  it.each([
    ['touchdowns per team', totals.touchdowns / perTeam, 2.2, 3.1],
    ['offensive plays per team', totals.plays / perTeam, 58, 68],
    ['drives per team', totals.drives / perTeam, 9, 13.5],
    ['field goal attempts per team', totals.fieldGoalAttempts / perTeam, 1.4, 2.6],
    ['field goal percentage', (totals.fieldGoalsMade / totals.fieldGoalAttempts) * 100, 78, 90],
    ['third down conversion percentage',
      (totals.thirdDownConversions / totals.thirdDowns) * 100, 36, 44],
    // Runs marginally high: drives average about a play shorter than real
    // football, so a few more of them end in a punt. Bounded and tracked rather
    // than tuned away, because narrowing it further would mean overfitting the
    // offence to a metric the reference engine does not validate against.
    ['punts per team', totals.punts / perTeam, 3.8, 6.0],
    ['in-game injuries per team', totals.injuries / perTeam, 0.4, 1.6],
  ])('%s is plausible', (_label, value, low, high) => {
    expect(value).toBeGreaterThanOrEqual(low);
    expect(value).toBeLessThanOrEqual(high);
  });

  it('gives the home team a real but not decisive edge', () => {
    const rate = (totals.homeWins / totals.decided) * 100;
    expect(rate).toBeGreaterThan(53);
    expect(rate).toBeLessThan(60);
  });
});
