// The franchise dashboard, against Postgres.
//
// The screen makes one call and draws nine things from it, so what is worth
// pinning here is that each of those nine is either a fact the save holds or
// an explicit null -- never a zero standing in for a number nobody has.
//
// The week-one case is the one that matters most, because it is the first
// screen after the world is built and every figure on it is either empty or
// freshly cloned. A dashboard that rendered a league position, a turnover
// differential or a record of achievement on day one would be lying on the
// very first screen a player sees.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { DashboardOut } from '../../supabase/functions/_shared/api/reads/dashboard';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';

const OWNER = '77777777-0000-0000-0000-0000000000da';

describe('the franchise dashboard', () => {
  let pipe: Pipe;
  let saveId = '';
  let day1: DashboardOut;

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    await pipe.sql`delete from public.saves where user_id = ${OWNER} and not is_template`;
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Dashboard dynasty', teamId: 'CLE', slot: 1,
    });
    saveId = out.saveId;
    day1 = await pipe.api.call<DashboardOut>('dashboard', { saveId });
  }, 300_000);

  afterAll(async () => {
    if (saveId !== '') await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  }, 300_000);

  it('names the club from the save rather than from the client', () => {
    expect(day1.identity.teamId).toBe('CLE');
    expect(day1.identity.teamName).not.toBe('');
    expect(day1.identity.fullName).toContain(day1.identity.teamName);
    // "North", not "AC North": the conference is already on the same line.
    expect(day1.identity.divisionShort).not.toContain(day1.identity.conferenceName);
    expect(day1.identity.primary).toMatch(/^#/);
  });

  it('rates the roster it actually cloned', () => {
    for (const r of [day1.ratings.offense, day1.ratings.defense, day1.ratings.overall]) {
      expect(r).not.toBeNull();
      expect(r as number).toBeGreaterThan(40);
      expect(r as number).toBeLessThan(100);
    }
    expect(day1.ratings.overallBand).not.toBeNull();
  });

  it('reports no league position before a game is played', () => {
    // Every club is level in week one and the order is only the tie-break. A
    // position nobody has earned is not a fact.
    expect(day1.rank).toBeNull();
    expect(day1.teams).toBe(32);
    expect(day1.record?.played).toBe(0);
    expect(day1.record?.wins).toBe(0);
  });

  it('reports no turnover differential before a game is played', () => {
    // Nought given and nought taken is a real thing a season can be. Not
    // having played is a different thing, and it is reported as one.
    expect(day1.turnovers).toBeNull();
  });

  it('hands over the owner, his patience and what he asked for', () => {
    expect(day1.owner).not.toBeNull();
    expect(day1.owner?.name).not.toBe('');
    expect(day1.owner?.patience).not.toBeNull();
    expect(day1.owner?.mandate).not.toBeNull();
    // Nothing has been played, so there is nothing to judge the mandate by.
    expect(day1.owner?.standing).toBeNull();
  });

  it('has a week one fixture, with the opponent measured', () => {
    expect(day1.thisWeek.state).toBe('FIXTURE');
    expect(day1.thisWeek.week).toBe(1);
    expect(day1.thisWeek.opponentId).not.toBeNull();
    expect(day1.thisWeek.opponentId).not.toBe('CLE');
    expect(day1.thisWeek.home).not.toBeNull();
    expect(day1.thisWeek.opponentOverall).not.toBeNull();
    expect(day1.thisWeek.difficulty).not.toBeNull();
    // Both clubs are 0-0, which is a record rather than the absence of one.
    expect(day1.thisWeek.opponentRecord?.wins).toBe(0);
  });

  it('counts the rows the checklist reports on', () => {
    expect(day1.shape.rosterCount).toBeGreaterThan(40);
    expect(day1.shape.fixtures).toBeGreaterThan(0);
    expect(day1.shape.played).toBe(0);
  });

  it('judges the depth chart on the thirteen groups, not the seed\'s finer slots', () => {
    // team_depth_charts also holds LT, NICKEL, GUNNER and forty more. Counting
    // those would report a chart three times as complete as it is, and the
    // checklist row would read "13 of 13" off a number that was 44.
    expect(day1.shape.positionGroups).toBe(13);
    expect(day1.shape.depthGroups).toBe(13);
    expect(day1.shape.depthStarters).toBe(13);
  });

  it('fills in the record and the position once a week is played', async () => {
    const week = await pipe.api.call<WeekOutcome>('sim-week', { saveId });
    expect(week.played).toBeGreaterThan(0);
    const after = await pipe.api.call<DashboardOut>('dashboard', { saveId });

    expect(after.record?.played).toBe(1);
    expect(after.rank).not.toBeNull();
    expect(after.shape.played).toBeGreaterThan(0);
    // The differential is the two columns the standings hold, not a third
    // number computed somewhere else.
    expect(after.record?.differential)
      .toBe((after.record?.pointsFor ?? 0) - (after.record?.pointsAgainst ?? 0));
    // Turnovers are recorded on every box score, so a played week has a
    // differential even when it happens to be nought.
    expect(after.turnovers).not.toBeNull();
    expect(after.turnovers?.differential)
      .toBe((after.turnovers?.taken ?? 0) - (after.turnovers?.given ?? 0));
    expect(after.thisWeek.week).toBe(2);
  }, 300_000);

  it('counts the injured with the arithmetic the simulation uses', async () => {
    // The number on the screen has to be the number the engine benches. A
    // report that disagreed with who actually misses the game would be worse
    // than no report.
    const after = await pipe.api.call<DashboardOut>('dashboard', { saveId });
    const [row] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.player_injuries i
        join public.saves s on s.id = i.save_id
       where i.save_id = ${saveId} and i.team_id = 'CLE'
         and i.injured_season = s.season
         and i.injured_week < s.week
         and i.injured_week + i.weeks_out_estimate - 1 >= s.week`;
    expect(after.injuries).toBe(Number(row?.n ?? '-1'));
    // A starter is one of the injured, never more of them.
    expect(after.injuredStarters).toBeLessThanOrEqual(after.injuries);
  });

  it('rates the opponent unit by unit, and names their best', () => {
    expect(day1.thisWeek.opponentOffense).not.toBeNull();
    expect(day1.thisWeek.opponentDefense).not.toBeNull();
    expect(['Offense', 'Defense', 'Special teams'])
      .toContain(day1.thisWeek.opponentStrongest);
  });

  it('reports the last result from the club own side of the scoreboard', async () => {
    // Week one has none; after a week it is the club's score first, whether
    // they were at home or away.
    expect(day1.last).toBeNull();
    const after = await pipe.api.call<DashboardOut>('dashboard', { saveId });
    expect(after.last).not.toBeNull();
    const [row] = await pipe.sql<{ home: string; hs: number; as: number }[]>`
      select home_team_id as home, home_score as hs, away_score as "as"
        from public.game_results
       where save_id = ${saveId} and game_id = ${after.last?.gameId ?? ''}`;
    const mineIsHome = row?.home === 'CLE';
    expect(after.last?.home).toBe(mineIsHome);
    expect(after.last?.teamScore).toBe(mineIsHome ? row?.hs : row?.as);
    expect(after.last?.opponentScore).toBe(mineIsHome ? row?.as : row?.hs);
  });

  it('refuses a save this user does not own', async () => {
    const other = await openPipe('77777777-0000-0000-0000-0000000000db');
    await expect(other.api.call('dashboard', { saveId })).rejects.toThrow();
    await other.close();
  }, 60_000);
});
