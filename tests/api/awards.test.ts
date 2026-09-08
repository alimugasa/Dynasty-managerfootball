// The end of the year, against Postgres: voted, stored, and readable.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { SeasonOutcome } from '../../supabase/functions/_shared/api/rollover';
import type { RecapOut } from '../../supabase/functions/_shared/api/reads/recap';
import { STARTERS, POSITION_GROUPS } from '../../supabase/functions/_shared/engine/types';

const PORT = 8797;
const AWARDS_USER = '88888888-0000-0000-0000-00000000dead';

describe('awards against Postgres', () => {
  let pipe: Pipe;
  let saveId = '';
  let season = 0;

  beforeAll(async () => {
    pipe = await openPipe(PORT, AWARDS_USER);
    const created = await pipe.api.call<CreateSaveOut>('create-save', { name: 'Awards', teamId: 'BUF' });
    saveId = created.saveId;
    let phase = 'REGULAR_SEASON';
    while (phase === 'REGULAR_SEASON' || phase === 'PLAYOFFS') {
      const out = await pipe.api.call<WeekOutcome>('sim-week', { saveId });
      phase = out.phase;
      season = out.season;
    }
    await pipe.api.call<SeasonOutcome>('advance-season', { saveId });
  }, 300_000);

  afterAll(async () => {
    await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  });

  it('votes every award, with a ballot behind each', async () => {
    const out = await pipe.api.call<RecapOut>('recap', { saveId, season });
    expect(out.complete).toBe(true);
    expect(out.awards.map((a) => a.code).sort()).toEqual([
      'COACH_OF_THE_YEAR', 'DEFENSIVE_PLAYER', 'NEWCOMER', 'OFFENSIVE_PLAYER', 'PLAYER_OF_THE_YEAR',
    ]);
    for (const award of out.awards) {
      expect(award.winner).not.toBe('');
      expect(award.ballot.length).toBeGreaterThan(1);
      expect(award.voteShare ?? 0).toBeGreaterThan(0);
      // The player awards name a player; the coaching award names a coach.
      if (award.code === 'COACH_OF_THE_YEAR') {
        expect(award.coachId).not.toBeNull();
        expect(award.playerId).toBeNull();
      } else {
        expect(award.playerId).not.toBeNull();
      }
    }
  });

  it('picks two all-league teams that could take the field', async () => {
    const out = await pipe.api.call<RecapOut>('recap', { saveId, season });
    for (const team of ['ALL_LEAGUE_FIRST', 'ALL_LEAGUE_SECOND']) {
      const picked = out.honours.filter((h) => h.team === team);
      for (const group of POSITION_GROUPS) {
        expect(picked.filter((h) => h.position === group).length,
          `${group} on the ${team} team`).toBe(STARTERS[group]);
      }
    }
    // Including the positions that never appear in a box score.
    expect(out.honours.some((h) => h.position === 'OL')).toBe(true);
  });

  it('puts the award on the player, where the market reads it', async () => {
    const out = await pipe.api.call<RecapOut>('recap', { saveId, season });
    const winners = out.awards.flatMap((a) => (a.playerId === null ? [] : [a.playerId]));
    expect(winners.length).toBeGreaterThan(0);
    const carried = await pipe.sql<{ id: string; awards: number }[]>`
      select p->>'id' as id, (p->>'awards')::int as awards
        from public.save_documents, jsonb_array_elements(document->'players') p
       where save_id = ${saveId} and (p->>'awards')::int > 0`;
    // Everyone in the document carrying an award won one this season, and
    // every winner still in the league carries his. A winner who retired in
    // the same offseason has left the population, which is why this is a
    // subset rather than an equality.
    expect(carried.length).toBeGreaterThan(0);
    for (const row of carried) {
      expect(winners).toContain(row.id);
      // One per award he won: the best season in the league usually takes the
      // overall award and its side of the ball's, and carries both.
      expect(row.awards).toBe(winners.filter((id) => id === row.id).length);
    }
    const [allLeague] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n
        from public.save_documents, jsonb_array_elements(document->'players') p
       where save_id = ${saveId} and (p->>'allLeague')::int > 0`;
    expect(Number(allLeague?.n)).toBeGreaterThan(10);
  });

  it('opens the record book with the season just played', async () => {
    const out = await pipe.api.call<RecapOut>('recap', { saveId, season });
    expect(out.records.length).toBeGreaterThan(0);
    const passing = out.records.find((r) => r.code === 'PASS_YARDS' && r.scope === 'SINGLE_SEASON');
    expect(passing?.value).toBeGreaterThan(2500);
    expect(passing?.holder).not.toBe('');
    expect(passing?.setThisSeason).toBe(true);
    // A career record needs the career totals, which are rebuilt in the same
    // offseason: it exists too, and cannot be smaller than the season best.
    const career = out.records.find((r) => r.code === 'PASS_YARDS' && r.scope === 'CAREER');
    expect(career?.value).toBeGreaterThanOrEqual(passing?.value ?? 0);
  });

  it('says a season is not over rather than recapping one that is not', async () => {
    const out = await pipe.api.call<RecapOut>('recap', { saveId, season: season + 1 });
    expect(out.complete).toBe(false);
    expect(out.awards).toEqual([]);
    expect(out.championTeamId).toBeNull();
  });

  it('counts a lineman as having played, not as having missed the year', async () => {
    // A position that produces no box-score line was being charged with every
    // game of every season, which quietly accelerated the decline of every
    // lineman in the league. Games missed now come from the injuries recorded
    // against him: most linemen miss almost nothing, and the ones who do have
    // an injury to show for it.
    const [row] = await pipe.sql<{ mean: string; healthy: string; total: string }[]>`
      with carried as (
        select p->>'id' as id, (p->>'gamesMissedCareer')::int as missed,
               p->>'teamId' as team_id
          from public.save_documents, jsonb_array_elements(document->'players') p
         where save_id = ${saveId})
      select round(avg(c.missed), 2)::text as mean,
             count(*) filter (where c.missed <= 3)::text as healthy,
             count(*)::text as total
        from carried c
        join public.players pl on pl.save_id = ${saveId} and pl.player_id = c.id
       where pl.position_group = 'O-Line' and c.team_id is not null`;
    const total = Number(row?.total);
    expect(total).toBeGreaterThan(300);
    // One season of football: a whole-season charge for everyone would put
    // the mean at seventeen.
    expect(Number(row?.mean)).toBeLessThan(6);
    expect(Number(row?.healthy) / total).toBeGreaterThan(0.6);
  });
});
