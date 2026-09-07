// A dynasty is born random and lives deterministic.
//
// Every in-memory dynasty used to start from the same constant, so two players
// picking the same club got the same fifty years. The seed is now minted at
// newGame() and everything after it -- including the news ledger, which used to
// live in a React ref and vanish on reload -- follows from the save.

import { describe, expect, it } from 'vitest';
import { advanceToNextSeason, simWeek } from '../../src/game/actions';
import { newGame, type GameState } from '../../src/game/store';
import {
  ledgerFromJson, ledgerToJson,
} from '../../supabase/functions/_shared/engine/news/index.ts';

const TEAM = 'BUF';

const scores = (state: GameState): string =>
  state.results.map((g) => `${g.gameId}:${String(g.homeScore)}-${String(g.awayScore)}`).join(' ');

describe('newGame', () => {
  it('gives two dynasties for the same club different seeds and different week-1 results', () => {
    const a = newGame({ userTeamId: TEAM });
    const b = newGame({ userTeamId: TEAM });
    expect(a.userTeamId).toBe(TEAM);
    expect(b.userTeamId).toBe(TEAM);
    expect(a.seed).not.toBe(b.seed);

    const weekA = simWeek(a).state;
    const weekB = simWeek(b).state;
    expect(weekA.results.length).toBeGreaterThan(0);
    expect(scores(weekA)).not.toBe(scores(weekB));
  });

  it('never mints the seed a template uses', () => {
    for (let i = 0; i < 50; i += 1) {
      const seed = newGame({ userTeamId: TEAM }).seed;
      expect(seed).not.toBe(0);
      expect(Number.isInteger(seed)).toBe(true);
    }
  });

  it('replays week 1 exactly for an explicit seed', () => {
    const a = simWeek(newGame({ userTeamId: TEAM, seed: 12345 })).state;
    const b = simWeek(newGame({ userTeamId: TEAM, seed: 12345 })).state;
    expect(scores(a)).toBe(scores(b));
    expect(a.news.map((n) => n.headline)).toEqual(b.news.map((n) => n.headline));
  });
});

describe('the news ledger', () => {
  it('is carried in the state, not mutated in the previous one', () => {
    const start = newGame({ userTeamId: TEAM, seed: 7 });
    const after = simWeek(start).state;
    expect(start.ledger.headlines.size).toBe(0);
    expect(after.ledger.headlines.size).toBe(after.news.length - start.news.length);
  });

  it('survives the JSON round trip persistence uses', () => {
    const played = simWeek(newGame({ userTeamId: TEAM, seed: 7 })).state;
    const restored = ledgerFromJson(JSON.parse(JSON.stringify(ledgerToJson(played.ledger))));
    expect(restored.season).toBe(played.ledger.season);
    expect(restored.dropped).toBe(played.ledger.dropped);
    expect([...restored.headlines]).toEqual([...played.ledger.headlines]);
    expect([...restored.dealt.keys()]).toEqual([...played.ledger.dealt.keys()]);
    for (const [kind, ids] of played.ledger.dealt) {
      expect([...restored.dealt.get(kind) ?? []]).toEqual([...ids]);
    }
  });

  it('still forbids a repeat after a reload between weeks', () => {
    const week1 = simWeek(newGame({ userTeamId: TEAM, seed: 7 })).state;
    const reloaded: GameState = {
      ...week1, ledger: ledgerFromJson(ledgerToJson(week1.ledger)),
    };
    const week2 = simWeek(reloaded).state;
    const fresh = week2.news.slice(week1.news.length).map((n) => n.headline);
    const earlier = new Set(week1.news.map((n) => n.headline));
    expect(fresh.filter((h) => earlier.has(h))).toEqual([]);
    expect(week2.ledger.headlines.size).toBe(week2.news.length);
  });

  it('resets when the season rolls over', () => {
    const week1 = simWeek(newGame({ userTeamId: TEAM, seed: 7 })).state;
    const next = advanceToNextSeason({ ...week1, phase: 'OFFSEASON' });
    expect(next.ledger.season).toBe(next.season);
    expect(next.ledger.headlines.size).toBe(0);
  });
});
