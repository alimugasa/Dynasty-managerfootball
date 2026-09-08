// The mechanics the simulation is supposed to model, each isolated so a failure
// names the subsystem that broke.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { simulateGame } from '../../supabase/functions/_shared/engine/simulateGame.ts';
import { unitRatings } from '../../supabase/functions/_shared/engine/ratings.ts';
import {
  chargeSnaps,
  createRuntime,
  fatiguePenalty,
  recover,
  sideline,
  starterOf,
} from '../../supabase/functions/_shared/engine/roster.ts';
import { MissingUnitError, type GameResult, type TeamState }
  from '../../supabase/functions/_shared/engine/types.ts';
import { averageMatchup, buildTeam } from './fixtures.ts';

/** Mean of a box-score field across many seeded games. */
function meanOver(
  home: TeamState, away: TeamState, games: number,
  read: (game: GameResult) => number,
): number {
  let total = 0;
  for (let seed = 1; seed <= games; seed += 1) {
    total += read(simulateGame(home, away, createRng(seed * 104_729), { allowTie: true }));
  }
  return total / games;
}

describe('team strength comes from position groups', () => {
  it('an elite quarterback outproduces a poor one behind the same line', () => {
    const opponent = buildTeam({ id: 'DEF', abbreviation: 'DEF', seed: 5 });
    const elite = buildTeam({
      id: 'ELI', abbreviation: 'ELI', seed: 6, groupRatings: { QB: 95 },
    });
    const poor = buildTeam({
      id: 'POR', abbreviation: 'POR', seed: 6, groupRatings: { QB: 55 },
    });
    const eliteYards = meanOver(elite, opponent, 60, (g) => g.home.passYards);
    const poorYards = meanOver(poor, opponent, 60, (g) => g.home.passYards);
    expect(eliteYards).toBeGreaterThan(poorYards + 20);
  });

  it('the offensive line changes sacks allowed without touching the quarterback', () => {
    const opponent = buildTeam({ id: 'RSH', abbreviation: 'RSH', seed: 11 });
    const strong = buildTeam({
      id: 'WAL', abbreviation: 'WAL', seed: 12, groupRatings: { OL: 94 },
    });
    const weak = buildTeam({
      id: 'SIV', abbreviation: 'SIV', seed: 12, groupRatings: { OL: 52 },
    });
    const strongSacks = meanOver(strong, opponent, 60, (g) => g.home.sacksAllowed);
    const weakSacks = meanOver(weak, opponent, 60, (g) => g.home.sacksAllowed);
    expect(weakSacks).toBeGreaterThan(strongSacks + 0.5);
  });

  it('a dominant pass rush produces more sacks', () => {
    const offense = buildTeam({ id: 'OFF', abbreviation: 'OFF', seed: 21 });
    const fierce = buildTeam({
      id: 'FRC', abbreviation: 'FRC', seed: 22, groupRatings: { EDGE: 95, DT: 92 },
    });
    const mild = buildTeam({
      id: 'MLD', abbreviation: 'MLD', seed: 22, groupRatings: { EDGE: 55, DT: 52 },
    });
    expect(meanOver(offense, fierce, 60, (g) => g.home.sacksAllowed))
      .toBeGreaterThan(meanOver(offense, mild, 60, (g) => g.home.sacksAllowed) + 0.4);
  });

  it('a strong front seven suppresses rushing yards', () => {
    const offense = buildTeam({ id: 'RUN', abbreviation: 'RUN', seed: 31 });
    const stout = buildTeam({
      id: 'STT', abbreviation: 'STT', seed: 32, groupRatings: { DT: 95, LB: 93 },
    });
    const soft = buildTeam({
      id: 'SFT', abbreviation: 'SFT', seed: 32, groupRatings: { DT: 52, LB: 50 },
    });
    expect(meanOver(offense, soft, 60, (g) => g.home.rushYards))
      .toBeGreaterThan(meanOver(offense, stout, 60, (g) => g.home.rushYards) + 15);
  });

  it('two clubs with the same mean rating but different shapes are not equivalent', () => {
    // Both average 72 across the roster; one has invested in the quarterback.
    const balanced = buildTeam({ id: 'BAL', abbreviation: 'BAL', seed: 41, baseRating: 72 });
    const topHeavy = buildTeam({
      id: 'TOP', abbreviation: 'TOP', seed: 41, baseRating: 72,
      groupRatings: { QB: 92, WR: 64, TE: 64, RB: 64 },
    });
    const opponent = buildTeam({ id: 'OPP', abbreviation: 'OPP', seed: 42 });
    const balancedPoints = meanOver(balanced, opponent, 60, (g) => g.homeScore);
    const topHeavyPoints = meanOver(topHeavy, opponent, 60, (g) => g.homeScore);
    // A single overall number could not distinguish these two clubs at all.
    expect(Math.abs(topHeavyPoints - balancedPoints)).toBeGreaterThan(0.75);
  });

  it('removing a starter lowers the unit rating that starter belongs to', () => {
    const team = buildTeam({ id: 'UNI', abbreviation: 'UNI', seed: 51 });
    const runtime = createRuntime(team);
    const before = unitRatings(runtime);
    sideline(runtime, starterOf(runtime, 'QB').id);
    const after = unitRatings(runtime);
    expect(after.passOffense).toBeLessThan(before.passOffense);
    // Losing the quarterback must not move the run defence.
    expect(after.runDefense).toBeCloseTo(before.runDefense, 10);
  });
});

describe('home field advantage', () => {
  it('the home team wins more often than the visitor', () => {
    let home = 0;
    let decided = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const teams = averageMatchup(seed);
      const game = simulateGame(teams.home, teams.away, createRng(seed * 31), { allowTie: true });
      if (game.homeScore === game.awayScore) continue;
      decided += 1;
      if (game.homeScore > game.awayScore) home += 1;
    }
    expect(home / decided).toBeGreaterThan(0.52);
  });

  it('a neutral site removes the edge', () => {
    let home = 0;
    let decided = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const teams = averageMatchup(seed);
      const game = simulateGame(teams.home, teams.away, createRng(seed * 31), {
        allowTie: true, neutralSite: true,
      });
      if (game.homeScore === game.awayScore) continue;
      decided += 1;
      if (game.homeScore > game.awayScore) home += 1;
    }
    expect(home / decided).toBeGreaterThan(0.44);
    expect(home / decided).toBeLessThan(0.56);
  });

  it('visiting offences commit pre-snap penalties and hosts do not', () => {
    const { home, away } = averageMatchup(9);
    let awayPenalties = 0;
    let homePenalties = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const game = simulateGame(home, away, createRng(seed * 17));
      for (const play of game.plays) {
        if (play.outcome !== 'falseStart') continue;
        if (play.offense === away.id) awayPenalties += 1;
        else homePenalties += 1;
      }
    }
    expect(awayPenalties).toBeGreaterThan(0);
    expect(homePenalties).toBe(0);
  });
});

describe('fatigue', () => {
  it('accumulates with snaps and costs rating points', () => {
    const team = buildTeam({ id: 'TIR', abbreviation: 'TIR', seed: 61, stamina: 60 });
    const runtime = createRuntime(team);
    const quarterback = starterOf(runtime, 'QB');
    expect(fatiguePenalty(runtime, quarterback)).toBe(0);
    for (let i = 0; i < 80; i += 1) chargeSnaps(runtime, [quarterback]);
    expect(fatiguePenalty(runtime, quarterback)).toBeGreaterThan(0);
  });

  it('recovers while the unit is off the field', () => {
    const team = buildTeam({ id: 'RST', abbreviation: 'RST', seed: 62, stamina: 60 });
    const runtime = createRuntime(team);
    const back = starterOf(runtime, 'RB');
    for (let i = 0; i < 90; i += 1) chargeSnaps(runtime, [back]);
    const tired = fatiguePenalty(runtime, back);
    for (let i = 0; i < 5; i += 1) recover(runtime);
    expect(fatiguePenalty(runtime, back)).toBeLessThan(tired);
  });

  it('is capped, so a gassed player is poor rather than worthless', () => {
    const team = buildTeam({ id: 'CAP', abbreviation: 'CAP', seed: 63, stamina: 20 });
    const runtime = createRuntime(team);
    const player = starterOf(runtime, 'OL');
    for (let i = 0; i < 500; i += 1) chargeSnaps(runtime, [player]);
    expect(fatiguePenalty(runtime, player)).toBeLessThanOrEqual(12);
  });

  it('a low-stamina roster tires faster than a high-stamina one', () => {
    const weary = buildTeam({ id: 'WRY', abbreviation: 'WRY', seed: 64, stamina: 35 });
    const fit = buildTeam({ id: 'FIT', abbreviation: 'FIT', seed: 64, stamina: 95 });
    const weakRuntime = createRuntime(weary);
    const fitRuntime = createRuntime(fit);
    for (let i = 0; i < 70; i += 1) {
      chargeSnaps(weakRuntime, [starterOf(weakRuntime, 'OL')]);
      chargeSnaps(fitRuntime, [starterOf(fitRuntime, 'OL')]);
    }
    expect(fatiguePenalty(weakRuntime, starterOf(weakRuntime, 'OL')))
      .toBeGreaterThan(fatiguePenalty(fitRuntime, starterOf(fitRuntime, 'OL')));
  });
});

describe('injuries', () => {
  it('occur, and a fragile roster suffers more than a durable one', () => {
    const opponent = buildTeam({ id: 'OPI', abbreviation: 'OPI', seed: 71 });
    const brittle = buildTeam({
      id: 'BRT', abbreviation: 'BRT', seed: 72, durability: 25,
    });
    const sturdy = buildTeam({
      id: 'STD', abbreviation: 'STD', seed: 72, durability: 98,
    });
    let brittleCount = 0;
    let sturdyCount = 0;
    for (let seed = 1; seed <= 120; seed += 1) {
      brittleCount += simulateGame(brittle, opponent, createRng(seed * 13))
        .injuries.filter((i) => i.teamId === brittle.id).length;
      sturdyCount += simulateGame(sturdy, opponent, createRng(seed * 13))
        .injuries.filter((i) => i.teamId === sturdy.id).length;
    }
    expect(brittleCount).toBeGreaterThan(0);
    expect(brittleCount).toBeGreaterThan(sturdyCount);
  });

  it('carries a severity and a return timeline', () => {
    const { home, away } = averageMatchup(3);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200 && seen.size < 2; seed += 1) {
      for (const injury of simulateGame(home, away, createRng(seed * 977)).injuries) {
        seen.add(injury.severity);
        expect(injury.weeksOut).toBeGreaterThanOrEqual(0);
        if (injury.severity === 'minor') expect(injury.weeksOut).toBe(0);
        else expect(injury.weeksOut).toBeGreaterThan(0);
        if (injury.returnsThisGame) expect(injury.severity).toBe('minor');
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('sidelines the player, and his backup takes the snaps', () => {
    const team = buildTeam({ id: 'BKP', abbreviation: 'BKP', seed: 81 });
    const runtime = createRuntime(team);
    const first = starterOf(runtime, 'QB');
    sideline(runtime, first.id);
    const second = starterOf(runtime, 'QB');
    expect(second.id).not.toBe(first.id);
  });
});

describe('missing data is reported, never invented', () => {
  it('plays a back at quarterback when every quarterback is out, and says so in the box score', () => {
    // A club is never sent home over one position. The deepest back takes the
    // snaps, at the out-of-position penalty, and the line shows who it was.
    const team = buildTeam({ id: 'NQB', abbreviation: 'NQB', seed: 91 });
    const stripped: TeamState = {
      ...team,
      depthChart: { ...team.depthChart, QB: [] },
    };
    const opponent = buildTeam({ id: 'ANY', abbreviation: 'ANY', seed: 92 });
    const result = simulateGame(stripped, opponent, createRng(1));
    const passer = result.players.find((l) => l.teamId === 'NQB' && l.passAttempts > 0);
    expect(passer).toBeDefined();
    expect(team.players.find((p) => p.id === passer?.playerId)?.group).toBe('RB');
  });

  it('throws when neither a group nor its fallback has anyone', () => {
    const team = buildTeam({ id: 'NQB', abbreviation: 'NQB', seed: 91 });
    const stripped: TeamState = {
      ...team,
      depthChart: { ...team.depthChart, QB: [], RB: [] },
    };
    const opponent = buildTeam({ id: 'ANY', abbreviation: 'ANY', seed: 92 });
    expect(() => simulateGame(stripped, opponent, createRng(1)))
      .toThrow(MissingUnitError);
  });

  it('plays an extra receiver when the tight ends are gone, rather than failing', () => {
    const team = buildTeam({ id: 'NTE', abbreviation: 'NTE', seed: 93 });
    const stripped: TeamState = {
      ...team,
      depthChart: { ...team.depthChart, TE: [] },
    };
    const opponent = buildTeam({ id: 'ANY', abbreviation: 'ANY', seed: 94 });
    expect(() => simulateGame(stripped, opponent, createRng(1))).not.toThrow();
  });
});
