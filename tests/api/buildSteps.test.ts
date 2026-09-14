// What create-save reports it built, against what it actually built.
//
// The world screen shows a count under every step. The whole point of that
// screen is that those numbers are measurements rather than decoration, so
// this is the test that says so: every count the handler reports is compared
// with a fresh count of the rows in the save it just wrote.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import { BUILD_STEPS } from '../../supabase/functions/_shared/api/buildSteps.ts';
import { PRESETS } from '../../supabase/functions/_shared/api/franchiseOptions.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';

const OWNER = '77777777-0000-0000-0000-00000000bb02';

describe('what the build reports', () => {
  let pipe: Pipe;
  let out: CreateSaveOut;

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    await pipe.sql`delete from public.saves where user_id = ${OWNER} and not is_template`;
    out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Ironmen Franchise', teamId: 'CLE', slot: 1,
      gmFirstName: 'Durk', gmLastName: 'Banks', settings: PRESETS.NORMAL,
    });
  }, 300_000);

  afterAll(async () => {
    await pipe.sql`delete from public.saves where user_id = ${OWNER} and not is_template`;
    await pipe.close();
  }, 300_000);

  const count = async (table: string): Promise<number> => {
    const [row] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from ${pipe.sql(`public.${table}`)}
       where save_id = ${out.saveId}`;
    return Number(row?.n ?? 0);
  };

  it('reports all ten steps, in the order the screen renders them', () => {
    expect(out.steps.map((s) => s.key)).toEqual(BUILD_STEPS.map((s) => s.key));
  });

  it('labels them the way the shared list does', () => {
    for (const step of out.steps) {
      const def = BUILD_STEPS.find((s) => s.key === step.key);
      expect(step.label, step.key).toBe(def?.label);
    }
  });

  const reported = (key: string): number | null =>
    out.steps.find((s) => s.key === key)?.count ?? null;

  it('counts the league structure it wrote', async () => {
    expect(reported('league')).toBe(await count('league_conferences') + await count('league_divisions'));
  });

  it('counts the teams, the players and their contracts', async () => {
    expect(reported('teams')).toBe(await count('teams'));
    expect(reported('players')).toBe(await count('players'));
    expect(reported('contracts')).toBe(await count('player_contracts'));
  });

  it('counts the roster places and the depth chart', async () => {
    expect(reported('rosters')).toBe(await count('team_rosters'));
    expect(reported('depth')).toBe(await count('team_depth_charts'));
  });

  it('counts the fixtures and the draft picks', async () => {
    expect(reported('picks')).toBe(await count('draft_picks'));
    const [row] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.season_schedule
       where save_id = ${out.saveId} and season = ${out.season}`;
    expect(reported('schedule')).toBe(Number(row?.n ?? 0));
  });

  it('counts nothing where there is nothing to count', () => {
    // The news feed starts empty; opening the office is work rather than rows.
    // Both report null, and the screen says "Ready" rather than "0".
    for (const key of ['news', 'office']) {
      const step = out.steps.find((s) => s.key === key);
      expect(step?.count, key).toBeNull();
      expect(step?.unit, key).toBeNull();
    }
  });

  it('reports figures worth showing, not zeroes', async () => {
    // A build that wrote nothing would pass every equality above. This is what
    // says the world is actually there.
    for (const key of ['league', 'teams', 'players', 'rosters', 'contracts', 'depth',
      'schedule', 'picks']) {
      expect(reported(key) ?? 0, key).toBeGreaterThan(0);
    }
    expect(await count('standings')).toBeGreaterThan(0);
  });
});
