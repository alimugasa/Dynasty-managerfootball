// Ten seasons, saved and reloaded every year.
//
// The question this answers is not "does the engine run" -- the offseason and
// drift suites cover that. It is whether a save survives being written, read
// back and played on, ten times over, without accumulating the three kinds of
// damage a long-lived save actually accumulates: fields that go null, rows that
// point at things which no longer exist, and clubs that drift over the cap.
//
// So the league is not held in memory across seasons. Every year it is
// serialised, pushed through a store that round-trips it as JSON, migrated,
// validated and rebuilt -- and the next season is played on whatever came back.
// A save system tested by keeping the object graph alive tests nothing.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { runOffseason } from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { teamStatesFor } from '../../supabase/functions/_shared/engine/careerBridge.ts';
import { simulateSeason } from '../../supabase/functions/_shared/engine/season.ts';
import {
  MemorySaveStore, SAVE_SCHEMA_VERSION, checkIntegrity, describeViolations,
  deserialize, load, save, serialize,
  type SaveDocument, type SaveMeta,
} from '../../supabase/functions/_shared/save/index.ts';
import { loadCareerLeague, FIRST_SEASON } from '../../scripts/drift-report/careerLeague.ts';

const SAVE_ID = 'save-integration-0001';
const SEASONS = 10;

function metaFor(season: number, week: number, phase: string): SaveMeta {
  return {
    saveId: SAVE_ID,
    name: 'Integration dynasty',
    userTeamId: 'BUF',
    season,
    week,
    phase,
    seed: 20260907,
    engineVersion: 'test',
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
  };
}

interface RunResult {
  readonly documents: SaveDocument[];
  readonly store: MemorySaveStore;
  readonly seasonsPlayed: number;
  readonly gamesPlayed: number;
  readonly abandoned: number;
}

/** Creates a save and plays it forward, reloading from the store each season. */
async function playTenSeasons(): Promise<RunResult> {
  const store = new MemorySaveStore();
  const documents: SaveDocument[] = [];

  // ------------------------------------------------------------ create
  const created = loadCareerLeague();
  created.season = FIRST_SEASON;
  await save(store, SAVE_ID, serialize(created, { meta: metaFor(FIRST_SEASON, 1, 'PRESEASON') }));

  let gamesPlayed = 0;
  let abandoned = 0;
  let seasonsPlayed = 0;

  for (let i = 0; i < SEASONS; i += 1) {
    // ---------------------------------------------------------- load
    const { league } = await load(store, SAVE_ID);
    const season = league.season;

    // ------------------------------------------------------ play it
    const teams = teamStatesFor(league.teamIds, league.players,
      { fronts: league.fronts, coaches: league.coaches });
    const result = simulateSeason(season, teams, 20260907 + i * 7919);
    gamesPlayed += result.gamesPlayed;
    abandoned += result.abandoned;
    seasonsPlayed += 1;

    // Games missed carry onto the player, so the next offseason's
    // injury-driven decline has something to read. Without this the sim and the
    // offseason are two unrelated processes sharing a save.
    const byId = new Map(league.players.map((p) => [p.id, p]));
    for (const [playerId, missed] of result.gamesMissed) {
      const player = byId.get(playerId);
      if (player === undefined) continue;
      player.gamesMissedSeason = missed;
      player.gamesMissedCareer += missed;
    }

    // -------------------------------------------------- roll it over
    // runOffseason advances league.season itself. Setting it here as well would
    // paper over an engine that failed to, so the test asserts instead.
    runOffseason(league, createRng(20260907 + i));
    expect(league.season).toBe(season + 1);

    const document = serialize(league, { meta: metaFor(league.season, 1, 'PRESEASON') });
    await save(store, SAVE_ID, document);
    documents.push(document);
  }

  return { documents, store, seasonsPlayed, gamesPlayed, abandoned };
}

/** The run is expensive -- ten seasons of real football -- so it happens once
 *  and every assertion reads the same result. Each test re-running it would
 *  multiply the suite's cost by six for no extra coverage. */
let shared: Promise<RunResult> | null = null;
const theRun = (): Promise<RunResult> => {
  shared ??= playTenSeasons();
  return shared;
};

describe('a save played for ten seasons', () => {
  it('holds its integrity every season', { timeout: 300_000 }, async () => {
    const run = await theRun();
    expect(run.seasonsPlayed).toBe(SEASONS);

    for (const document of run.documents) {
      const violations = checkIntegrity(document);
      expect(
        violations,
        `season ${String(document.meta.season)}: ${describeViolations(violations)}`,
      ).toEqual([]);
    }
  });

  it('actually played football', { timeout: 300_000 }, async () => {
    // Guards the assertions above from passing on an empty league: ten seasons
    // of nothing has no nulls, no orphans and no cap trouble either.
    const run = await theRun();
    expect(run.gamesPlayed).toBeGreaterThan(SEASONS * 200);

    // Not zero. Over ten seasons one game went unplayed because a club lost a
    // whole position group to injury and had nobody to field -- the engine
    // reports that rather than inventing a scoreline, which is correct. The
    // underlying gap is that nothing signs a replacement mid-season: a real
    // club whose only kicker tears a knee signs one off the street on Tuesday,
    // and this league cannot. The bound is here to catch that becoming
    // systemic, which is the regression that would matter.
    expect(run.abandoned / run.gamesPlayed).toBeLessThan(0.005);

    const last = run.documents[run.documents.length - 1];
    expect(last).toBeDefined();
    if (last === undefined) return;
    expect(last.meta.season).toBe(FIRST_SEASON + SEASONS);
    expect(last.players.length).toBeGreaterThan(1500);
  });

  it('keeps every club at a legal roster and cap', { timeout: 300_000 }, async () => {
    const run = await theRun();
    for (const document of run.documents) {
      const capIssues = checkIntegrity(document).filter((v) => v.kind === 'CAP');
      expect(capIssues, `season ${String(document.meta.season)}`).toEqual([]);
    }
  });

  it('turns over its population without losing anyone mid-flight', { timeout: 300_000 }, async () => {
    const run = await theRun();
    const first = run.documents[0];
    const last = run.documents[run.documents.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first === undefined || last === undefined) return;

    // Ten years of drafts and retirements should replace a real share of the
    // league. A save that came back identical would mean the reload, not the
    // engine, was driving.
    const firstIds = new Set(first.players.filter((p) => !p.retired).map((p) => p.id));
    const lastIds = new Set(last.players.filter((p) => !p.retired).map((p) => p.id));
    const survived = [...lastIds].filter((id) => firstIds.has(id)).length;
    expect(survived).toBeGreaterThan(0);
    expect(survived).toBeLessThan(lastIds.size);
  });

  it('writes a save the current build declares it can read', { timeout: 300_000 }, async () => {
    const run = await theRun();
    for (const document of run.documents) {
      expect(document.version).toBe(SAVE_SCHEMA_VERSION);
    }
  });

  it('round-trips without drift: reload, re-save, byte-identical', { timeout: 300_000 }, async () => {
    // Load-then-save must be a fixed point. If it is not, every reload mutates
    // the save a little, and ten reloads compound it into something nobody
    // wrote -- the failure mode that makes long saves rot.
    const run = await theRun();
    const { league, document } = await load(run.store, SAVE_ID);
    const again = serialize(league, { meta: document.meta, deadMoneyBySeason: document.deadMoney });
    expect(JSON.stringify(again)).toBe(JSON.stringify(document));

    // And a second pass through deserialise must give the same league again.
    const third = serialize(deserialize(again).league,
      { meta: again.meta, deadMoneyBySeason: again.deadMoney });
    expect(JSON.stringify(third)).toBe(JSON.stringify(again));
  });
});
