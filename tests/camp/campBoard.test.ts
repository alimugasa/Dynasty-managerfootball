// What camp thinks of a player.
//
// These are judgements, so the tests are about the cases a front office would
// argue over: the expensive backup, the high pick who is not ready, the
// undrafted rookie who covers kicks, the veteran on a contract nobody can get
// out of. A board that got those four wrong would be wrong about camp.

import { describe, expect, it } from 'vitest';
import {
  BATTLE_GAP, campBattles, campScore, rosterProbability, rosterStatus,
  type CampContender, type CampPlayer,
} from '../../supabase/functions/_shared/api/campBoard';

const player = (over: Partial<CampPlayer> = {}): CampPlayer => ({
  playerId: 'p1', name: 'A Player', group: 'WR',
  overall: 70, potential: 74, age: 26, experienceYears: 4,
  capHit: 1_200_000, deadMoney: 0, draftRound: null, rookie: false,
  depth: 4, groupSize: 7, specialTeams: 50, schemeFit: 50,
  injured: false, practiceGrade: 50, preseasonGrade: null,
  ...over,
});

const contender = (over: Partial<CampPlayer> = {}): CampContender => {
  const p = player(over);
  const probability = rosterProbability(p);
  return { ...p, probability, status: rosterStatus(p, probability) };
};

describe('roster probability', () => {
  it('makes a starter safe and a fifth-stringer a long way back', () => {
    expect(rosterProbability(player({ depth: 1 }))).toBeGreaterThan(85);
    expect(rosterProbability(player({ depth: 9 }))).toBeLessThan(35);
  });

  it('never leaves the scale', () => {
    // Every modifier stacked one way, then the other.
    const best = player({
      depth: 1, rookie: true, draftRound: 1, potential: 95, overall: 70, age: 22,
      specialTeams: 100, schemeFit: 100, practiceGrade: 100, preseasonGrade: 100,
      deadMoney: 9_000_000, capHit: 9_000_000,
    });
    const worst = player({
      depth: 14, age: 35, capHit: 12_000_000, specialTeams: 0, schemeFit: 0,
      practiceGrade: 0, preseasonGrade: 0, injured: true,
    });
    expect(rosterProbability(best)).toBe(100);
    expect(rosterProbability(worst)).toBe(0);
  });

  it('keeps a player the club cannot afford to release', () => {
    // Dead money is the reason a club keeps somebody it has stopped liking.
    const sticky = player({ depth: 5, capHit: 5_000_000, deadMoney: 4_500_000 });
    const free = player({ depth: 5, capHit: 5_000_000, deadMoney: 0 });
    expect(rosterProbability(sticky)).toBeGreaterThan(rosterProbability(free));
  });

  it('turns on an expensive player who is not starting', () => {
    // Depth 5, not 3: a receiver room starts three, so depth 3 is a starter
    // and there is no "not starting" to penalise.
    const paid = player({ depth: 5, capHit: 8_000_000 });
    const cheap = player({ depth: 5, capHit: 900_000 });
    expect(rosterProbability(paid)).toBeLessThan(rosterProbability(cheap));
  });

  it('gives a high pick the year he has not earned, and gives an undrafted rookie nothing', () => {
    const first = player({ depth: 6, rookie: true, draftRound: 1 });
    const seventh = player({ depth: 6, rookie: true, draftRound: 7 });
    const undrafted = player({ depth: 6, rookie: true, draftRound: null });
    expect(rosterProbability(first)).toBeGreaterThan(rosterProbability(seventh));
    expect(rosterProbability(seventh)).toBeGreaterThan(rosterProbability(undrafted));
  });

  it('counts special teams, which is what keeps a fringe player', () => {
    const cover = player({ depth: 6, specialTeams: 90 });
    const cannot = player({ depth: 6, specialTeams: 20 });
    expect(rosterProbability(cover)).toBeGreaterThan(rosterProbability(cannot));
  });

  it('weighs a preseason grade more heavily than a practice one', () => {
    const base = { depth: 5, practiceGrade: 50 } as const;
    const practised = rosterProbability(player({ ...base, practiceGrade: 80 }));
    const played = rosterProbability(player({ ...base, preseasonGrade: 80 }));
    // Both help; the one that happened against another club helps more.
    expect(practised).toBeGreaterThan(rosterProbability(player(base)));
    expect(played).toBeGreaterThan(practised);
  });

  it('does not touch the overall rating', () => {
    // The whole point: a good August makes a man likelier to be kept, not
    // better. Nothing in this module returns a rating at all.
    const p = player({ overall: 70, preseasonGrade: 99, practiceGrade: 99 });
    expect(p.overall).toBe(70);
    expect(rosterProbability(p)).toBeLessThanOrEqual(100);
  });
});

describe('the seven statuses', () => {
  it('reads a starter as a lock and a deep reserve as a long shot', () => {
    const starter = contender({ depth: 1 });
    expect(starter.status).toBe('LOCK');
    const deep = contender({ depth: 10, capHit: 900_000 });
    expect(deep.status).toBe('LONG_SHOT');
  });

  it('says Injured before anything else, because the number is provisional', () => {
    const hurt = contender({ depth: 1, injured: true });
    expect(hurt.status).toBe('INJURED');
  });

  it('separates a rookie from a veteran at the same odds', () => {
    // The one thing the probability cannot say. A rookie at 55 and a
    // nine-year veteran at 55 are the same odds and different situations.
    const rookie = contender({ depth: 6, rookie: true, draftRound: 3, capHit: 900_000 });
    expect(rookie.status).toBe('ROOKIE_WATCH');
    const veteran = contender({ depth: 4, experienceYears: 9, capHit: 900_000 });
    expect(veteran.status).not.toBe('ROOKIE_WATCH');
  });

  it('calls an expensive man who will not make it a cut candidate', () => {
    const paid = contender({ depth: 9, capHit: 7_000_000, age: 33 });
    expect(paid.status).toBe('CUT_CANDIDATE');
    // The same player on the minimum is merely a long shot: there is no cap
    // decision attached to him.
    const minimum = contender({ depth: 9, capHit: 800_000, age: 33 });
    expect(minimum.status).toBe('LONG_SHOT');
  });
});

describe('camp battles', () => {
  const room = (overs: readonly Partial<CampPlayer>[]): CampContender[] =>
    overs.map((o, i) => contender({ playerId: `p${String(i)}`, depth: i + 1, ...o }));

  it('finds a battle only where two players are genuinely close', () => {
    const close = room([
      { group: 'QB', overall: 78 }, { group: 'QB', overall: 76 }, { group: 'QB', overall: 60 },
    ]);
    const [battle] = campBattles(close);
    expect(battle?.group).toBe('QB');
    expect(battle?.starting).toBe(true);
    expect(battle?.players).toHaveLength(2);
  });

  it('calls nothing a battle when the room is settled', () => {
    // Every club has three quarterbacks. That is not a competition.
    const settled = room([
      { group: 'QB', overall: 88 }, { group: 'QB', overall: 62 }, { group: 'QB', overall: 55 },
    ]);
    expect(campBattles(settled)).toEqual([]);
  });

  it('treats a three-way for one job as one battle, not two', () => {
    const three = room([
      { group: 'WR', overall: 72 }, { group: 'WR', overall: 71 },
      { group: 'WR', overall: 70 }, { group: 'WR', overall: 50 },
    ]);
    const battles = campBattles(three);
    expect(battles).toHaveLength(1);
    expect(battles[0]?.players).toHaveLength(3);
  });

  it('puts the starting jobs first', () => {
    const mixed = [
      ...room([{ group: 'QB', overall: 60 }, { group: 'QB', overall: 59.5 }]),
      ...room([{ group: 'WR', overall: 70 }, { group: 'WR', overall: 69 }]),
    ];
    const battles = campBattles(mixed);
    expect(battles.length).toBeGreaterThan(0);
    expect(battles[0]?.starting).toBe(true);
  });

  it('scores a camp on what has been seen, with the career still deciding most of it', () => {
    // Three practices do not undo a career, but they do move a man.
    const seen = player({ overall: 70, practiceGrade: 90 });
    const unseen = player({ overall: 70, practiceGrade: 50 });
    expect(campScore(seen)).toBeGreaterThan(campScore(unseen));
    // And a much better player still outranks a hot August.
    expect(campScore(player({ overall: 82, practiceGrade: 40 })))
      .toBeGreaterThan(campScore(seen));
  });

  it('uses the gap it documents', () => {
    const inside = room([{ group: 'TE', overall: 70 }, { group: 'TE', overall: 70 - (BATTLE_GAP / 2) }]);
    const outside = room([{ group: 'TE', overall: 70 }, { group: 'TE', overall: 70 - BATTLE_GAP * 3 }]);
    expect(campBattles(inside).length).toBe(1);
    expect(campBattles(outside).length).toBe(0);
  });
});
