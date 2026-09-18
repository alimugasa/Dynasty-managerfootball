// The face read, against Postgres.
//
// Three things worth a database to check, and none of them provable from a
// unit test: that a real save's players all carry a seed, that a season
// rollover keeps that true for the draft class it invents, and that the read
// refuses to answer for a save the caller does not own.
//
// The second is the one this file exists for. Migration 0036 backfilled every
// player who existed and said nothing about the ones who arrive later; the
// first rollover after it failed outright on the not-null constraint, and
// nothing in the avatar code could have caught that because the avatar code is
// never on the rollover path. 0037 put the formula in a trigger. This is the
// test that says so.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { AvatarsOut } from '../../supabase/functions/_shared/api/reads/avatars';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import { signature } from '../../supabase/functions/_shared/avatar/unique';

const OWNER = '77777777-0000-0000-0000-0000000000af';

describe('the avatars read', () => {
  let pipe: Pipe;
  let saveId = '';
  let userTeam = '';

  const faces = (playerIds: readonly string[]): Promise<AvatarsOut> =>
    pipe.api.call<AvatarsOut>('avatars', { saveId, playerIds });

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    await pipe.sql`delete from public.saves where user_id = ${OWNER} and not is_template`;
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Portrait dynasty', teamId: 'SEA', slot: 1,
      gmFirstName: 'Rosalind', gmLastName: 'Achebe',
    });
    saveId = out.saveId;
    const [save] = await pipe.sql<{ user_team_id: string }[]>`
      select user_team_id from public.saves where id = ${saveId}`;
    userTeam = save?.user_team_id ?? '';
  }, 600_000);

  afterAll(async () => {
    if (saveId !== '') await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  }, 120_000);

  it('gives every player in a fresh save a seed', async () => {
    const [row] = await pipe.sql<{ total: string; seeded: string; distinct: string }[]>`
      select count(*)::text as total,
             count(avatar_seed)::text as seeded,
             count(distinct avatar_seed)::text as distinct
        from public.players where save_id = ${saveId}`;
    expect(Number(row?.total)).toBeGreaterThan(1000);
    expect(row?.seeded).toBe(row?.total);
    // A seed shared by two players is two players with one face.
    expect(row?.distinct).toBe(row?.total);
  });

  it('answers for the players it is asked about, and no others', async () => {
    const roster = await pipe.sql<{ player_id: string }[]>`
      select player_id from public.players
       where save_id = ${saveId} and team_id = ${userTeam}
       order by player_id limit 12`;
    const ids = roster.map((r) => r.player_id);
    const out = await faces(ids);
    expect(out.rows.map((r) => r.playerId).sort()).toEqual([...ids].sort());
    for (const row of out.rows) {
      expect(row.seed).not.toBe('');
      expect(row.position).not.toBe('');
      expect(row.age).toBeGreaterThan(0);
      // Nothing is stored until a commissioner stores it, and the read reports
      // that rather than inventing a heritage or an override.
      expect(row.heritage).toBeNull();
      expect(row.overrides).toBeNull();
    }
  });

  it('draws the same person the client will draw', async () => {
    const [row] = await pipe.sql<{ player_id: string }[]>`
      select player_id from public.players
       where save_id = ${saveId} and team_id = ${userTeam} order by player_id limit 1`;
    const id = row?.player_id ?? '';
    const out = await faces([id]);
    const fact = out.rows[0];
    expect(fact).toBeDefined();
    if (fact === undefined) return;
    const a = generateAvatar({ seed: fact.seed, position: fact.position, age: fact.age });
    const b = generateAvatar({ seed: fact.seed, position: fact.position, age: fact.age });
    expect(signature(a.identity)).toBe(signature(b.identity));
  });

  it('keeps the draft class seeded through a rollover', async () => {
    // The whole reason 0037 exists. A season played out and rolled over
    // inserts a draft class that knows nothing about avatar_seed.
    let outcome: WeekOutcome = {
      season: 0, week: 0, phase: 'REGULAR_SEASON', played: 0, abandoned: [], champion: null,
    };
    while (outcome.phase === 'REGULAR_SEASON') {
      outcome = await pipe.api.call<WeekOutcome>('sim-week', { saveId });
    }
    while (outcome.phase !== 'REGULAR_SEASON' && outcome.champion === null) {
      outcome = await pipe.api.call<WeekOutcome>('sim-week', { saveId });
    }
    await pipe.api.call('advance-season', { saveId });
    const [row] = await pipe.sql<{ missing: string; rookies: string }[]>`
      select count(*) filter (where avatar_seed is null)::text as missing,
             count(*) filter (where rookie_flag)::text as rookies
        from public.players where save_id = ${saveId}`;
    expect(Number(row?.rookies)).toBeGreaterThan(0);
    expect(Number(row?.missing)).toBe(0);

    // And the face a manager scouted is the face he drafted. A prospect has no
    // players row, so the draft board computes his seed from the same
    // expression this asserts -- which holds only because a drafted prospect
    // keeps his id. If that ever stops being true, a scouted man and the man
    // who arrives are two different people, and this is what says so.
    const [drift] = await pipe.sql<{ wrong: string }[]>`
      select count(*)::text as wrong from public.players
       where save_id = ${saveId} and rookie_flag
         and avatar_seed
             is distinct from encode(digest(save_id::text || ':' || player_id, 'sha256'), 'hex')`;
    expect(Number(drift?.wrong)).toBe(0);
  }, 900_000);

  it('refuses a save the caller does not own', async () => {
    const other = await openPipe('77777777-0000-0000-0000-0000000000ab');
    try {
      await expect(
        other.api.call<AvatarsOut>('avatars', { saveId, playerIds: ['BUF_QB_01'] }),
      ).rejects.toThrow();
    } finally {
      await other.close();
    }
  });
});
