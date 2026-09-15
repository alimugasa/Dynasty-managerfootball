// The league's shape and its names, against Postgres.
//
// LEAGUE_SHAPE is a claim about the data -- 32 clubs, 2 conferences, 8
// divisions, 4 each -- and a claim about data belongs against the data rather
// than in a comment. If someone adds a conference without adding the clubs to
// fill it, this is what says so.
//
// The names are checked here too. They shipped for months as the two
// conferences of a real league, in a seed CSV where the source denylist never
// looked, so the guard against that coming back has to read the rows.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, TEMPLATE, type Pipe } from './harness.ts';
import { LEAGUE_SHAPE } from '../../supabase/functions/_shared/api/leaguePlacing.ts';

/** Anything one word away from a real league's conferences. */
const FORBIDDEN = /\b(american|national)\b/i;

describe('the league structure', () => {
  let pipe: Pipe;

  beforeAll(async () => { pipe = await openPipe(); }, 60_000);
  afterAll(async () => { await pipe.close(); }, 60_000);

  it('is 32 clubs in 2 conferences of 4 divisions of 4', async () => {
    const [row] = await pipe.sql<{
      teams: string; conferences: string; divisions: string;
    }[]>`
      select (select count(*) from public.teams where save_id = ${TEMPLATE})::text as teams,
             (select count(*) from public.league_conferences
               where save_id = ${TEMPLATE})::text as conferences,
             (select count(*) from public.league_divisions
               where save_id = ${TEMPLATE})::text as divisions`;
    expect(Number(row?.teams)).toBe(LEAGUE_SHAPE.teams);
    expect(Number(row?.conferences)).toBe(LEAGUE_SHAPE.conferences);
    expect(Number(row?.divisions)).toBe(LEAGUE_SHAPE.divisions);
  });

  it('puts exactly four clubs in every division, and four divisions in each conference', async () => {
    const perDivision = await pipe.sql<{ division_id: string; n: string }[]>`
      select division_id, count(*)::text as n from public.teams
       where save_id = ${TEMPLATE} group by division_id order by division_id`;
    expect(perDivision).toHaveLength(LEAGUE_SHAPE.divisions);
    for (const d of perDivision) {
      expect(Number(d.n), d.division_id).toBe(LEAGUE_SHAPE.teamsPerDivision);
    }
    const perConference = await pipe.sql<{ conference_id: string; n: string }[]>`
      select conference_id, count(*)::text as n from public.league_divisions
       where save_id = ${TEMPLATE} group by conference_id order by conference_id`;
    expect(perConference).toHaveLength(LEAGUE_SHAPE.conferences);
    for (const c of perConference) {
      expect(Number(c.n), c.conference_id).toBe(LEAGUE_SHAPE.divisionsPerConference);
    }
  });

  it('gives every conference a name, an abbreviation and a short name', async () => {
    const rows = await pipe.sql<{
      conference_id: string; name: string; abbreviation: string; short_name: string;
    }[]>`
      select conference_id, name, abbreviation, short_name
        from public.league_conferences where save_id = ${TEMPLATE} order by conference_id`;
    for (const c of rows) {
      expect(c.name, c.conference_id).toContain('Conference');
      expect(c.abbreviation, c.conference_id).toHaveLength(2);
      expect(c.short_name.length, c.conference_id).toBeGreaterThan(0);
      // The short name is the conference without the word, and the name is
      // built from it -- not the other way round, and not by cutting.
      expect(c.name, c.conference_id).toBe(`${c.short_name} Conference`);
    }
  });

  it('names every division for its conference and its region', async () => {
    const rows = await pipe.sql<{
      division_id: string; name: string; region: string; conference_name: string;
    }[]>`
      select d.division_id, d.name, d.region, c.name as conference_name
        from public.league_divisions d
        join public.league_conferences c
          on c.save_id = d.save_id and c.conference_id = d.conference_id
       where d.save_id = ${TEMPLATE} order by d.division_id`;
    for (const d of rows) {
      expect(LEAGUE_SHAPE.regions, d.division_id).toContain(d.region);
      expect(d.name, d.division_id).toBe(`${d.conference_name} ${d.region}`);
      // The id is not a label and must not leak into one.
      expect(d.name, d.division_id).not.toContain(d.division_id);
    }
  });

  it('carries no conference name one word from a real league\'s', async () => {
    const rows = await pipe.sql<{ name: string }[]>`
      select name from public.league_conferences where save_id = ${TEMPLATE}
      union all
      select name from public.league_divisions where save_id = ${TEMPLATE}`;
    for (const r of rows) expect(r.name, r.name).not.toMatch(FORBIDDEN);
  });

  it('refuses a region the label builders have no word for', async () => {
    // The check added by 0031. Without it a division could arrive spelled
    // "Eastern" and produce a label nothing else in the product uses.
    await expect(pipe.sql`
      insert into public.league_divisions
        (save_id, division_id, conference_id, name, region, data_class)
      values (${TEMPLATE}, 'AC-X', 'AC', 'Atlas Conference Eastern', 'Eastern', 'GENERATED')
    `).rejects.toThrow(/region_check/);
  });
});
