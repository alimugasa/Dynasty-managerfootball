// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { openPipe, type Pipe } from './harness';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { LeagueIntelligenceOut } from '../../supabase/functions/_shared/api/reads/leagueIntelligence';
import { readTeamRankings } from '../../supabase/functions/_shared/api/leagueIntelligence/teamRankings';
import { readAwardRaces } from '../../supabase/functions/_shared/api/leagueIntelligence/awardRead';
import { readPlayoffPicture } from '../../supabase/functions/_shared/api/leagueIntelligence/playoffPicture';
import { ownedSave } from '../../supabase/functions/_shared/api/save';
import { loadSeeds } from '../../supabase/functions/_shared/api/postseason';
const owner = randomUUID(); let pipe: Pipe; let id: string; let early: LeagueIntelligenceOut;
let middle: LeagueIntelligenceOut; let phase = 'REGULAR_SEASON'; let week = 1;
const read = () => pipe.api.call<LeagueIntelligenceOut>('league-intelligence', { saveId: id });
const step = async () => {
  const out = await pipe.api.call<{ phase: string; week: number }>('sim-week', { saveId: id });
  phase = out.phase; week = out.week;
};
beforeAll(async () => {
  pipe = await openPipe(owner);
  id = (await pipe.api.call<CreateSaveOut>('create-save', { name: 'League evidence', teamId: 'CLE', slot: 1,
    gmFirstName: 'Ari', gmLastName: 'Vale' })).saveId;
  early = await read();
  while (week <= early.calendar.pictureFromWeek) await step();
  middle = await read();
}, 300_000);
afterAll(async () => {
  if (pipe) {
    if (id) await pipe.sql`delete from public.saves where id = ${id}`;
    await pipe.sql`delete from auth.users where id = ${owner}`;
    await pipe.close();
  }
}, 30_000);
describe('regular-season intelligence against real games', () => {
  it('waits for real completed weeks, without inventing empty-season rankings', () => {
    expect(early.calendar.awardsActive).toBe(false); expect(early.picture).toBeNull();
    expect(early.rankings.every((b) => b.rows.length === 32 && b.rows.every((r) => r.rank === null))).toBe(true);
    expect(middle.calendar.awardsActive).toBe(true); expect(middle.calendar.pictureActive).toBe(true);
  });
  it('keeps conferences separate and uses division winners ahead of other qualifiers', () => {
    expect(middle.picture?.conferences).toHaveLength(2);
    expect(new Set(middle.picture?.conferences.flatMap((c) => c.teams.map((t) => t.teamId))).size).toBe(32);
    for (const c of middle.picture?.conferences ?? []) {
      expect(c.teams.filter((t) => t.seed !== null)).toHaveLength(middle.picture?.qualifiers ?? -1);
      expect(c.teams.filter((t) => t.status === 'DIVISION LEADER')).toHaveLength(4);
      expect(c.teams.every((t) => !String(t.status).includes('CLINCHED') && !String(t.status).includes('ELIMINATED'))).toBe(true);
      expect(c.teams.filter((t) => t.status === 'DIVISION LEADER').every((t) => t.divisionRank === 1)).toBe(true);
    }
  });
  it('ranks all teams from actual statistics, with only eligible rookie and defensive candidates', async () => {
    expect(middle.rankings).toHaveLength(9);
    expect(middle.rankings.every((b) => b.rows.length === 32)).toBe(true);
    const offense = middle.rankings.find((b) => b.key === 'offense'); const top = offense?.rows[0];
    if (!top) throw new Error('Missing offense leader');
    const [stats] = await pipe.sql<{ yards: number; n: number }[]>`
      select sum(case when home_team_id = ${top.teamId} then home_pass_yards + home_rush_yards
         else away_pass_yards + away_rush_yards end)::float8 as yards, count(*)::int as n
        from public.game_results where save_id = ${id} and competition = 'REGULAR'
          and (home_team_id = ${top.teamId} or away_team_id = ${top.teamId})`;
    if (!stats) throw new Error('Missing games');
    expect(top.value).toBe(Math.round(stats.yards / stats.n * 10) / 10);
    expect(middle.races?.filter((r) => r.code.startsWith('NEWCOMER')).flatMap((r) => r.candidates).every((p) => p.experience === 0)).toBe(true);
    expect(middle.races?.find((r) => r.code === 'DEFENSIVE_PLAYER')?.candidates.every((p) => ['EDGE', 'DT', 'LB', 'CB', 'S'].includes(p.group))).toBe(true);
    const report = process.env['LEAGUE_VALIDATION_REPORT'];
    if (report !== undefined) await writeFile(report, JSON.stringify({
      through: middle.calendar.throughWeek,
      leaders: middle.rankings.map((b) => ({ metric: b.key, top: b.rows[0], tiesAtFirst: b.rows.filter((r) => r.rank === 1).length })),
      awards: middle.races?.map((r) => ({ name: r.name, candidates: r.candidates.map((p) => ({ id: p.playerId, group: p.group, index: p.index, evidence: p.evidence })) })),
    }, null, 2));
  });
  it('is deterministic and excludes both postseason and future-week lines', async () => {
    expect(await read()).toEqual(middle);
    const season = middle.calendar.season; const through = middle.calendar.throughWeek;
    const before = await readAwardRaces(pipe.sql, id, season, through);
    // Isolated adversarial rows: copy a real game and line, changing only the
    // competition/week and huge production, then prove they cannot enter reads.
    try {
      for (const [gameId, competition, targetWeek] of [['race-poison-playoff', 'PLAYOFF', 1], ['race-poison-future', 'REGULAR', 99]] as const) {
        await pipe.sql`insert into public.season_schedule select (jsonb_populate_record(null::public.season_schedule,
          to_jsonb(g) || jsonb_build_object('game_id', ${gameId}::text, 'competition', ${competition}::text,
          'week', ${targetWeek}::int))).*
          from public.season_schedule g where save_id = ${id} and competition = 'REGULAR' limit 1`;
        await pipe.sql`insert into public.game_results select (jsonb_populate_record(null::public.game_results,
          to_jsonb(g) || jsonb_build_object('game_id', ${gameId}::text, 'competition', ${competition}::text,
          'week', ${targetWeek}::int, 'home_pass_yards', 999999))).*
          from public.game_results g where save_id = ${id} and competition = 'REGULAR' limit 1`;
        await pipe.sql`insert into public.player_game_stats select (jsonb_populate_record(null::public.player_game_stats,
          to_jsonb(g) || jsonb_build_object('game_id', ${gameId}::text, 'competition', ${competition}::text,
          'week', ${targetWeek}::int, 'pass_yards', 999999))).*
          from public.player_game_stats g where save_id = ${id} and competition = 'REGULAR' limit 1`;
      }
      expect(await readAwardRaces(pipe.sql, id, season, through)).toEqual(before);
      expect(await readTeamRankings(pipe.sql, id, season, through)).toEqual(middle.rankings);
    } finally {
      await pipe.sql`delete from public.game_results where save_id = ${id} and game_id like 'race-poison-%'`;
      await pipe.sql`delete from public.season_schedule where save_id = ${id} and game_id like 'race-poison-%'`;
    }
  });
  it('reports missing game statistics instead of inventing rankings or empty races', async () => {
    const rollback = new Error('restore validation fixture');
    await expect(pipe.sql.begin(async (tx) => {
      const [game] = await tx<{ game_id: string; home_team_id: string }[]>`
        select game_id, home_team_id from public.game_results where save_id = ${id} and competition = 'REGULAR' limit 1`;
      if (game === undefined) throw new Error('No validation game');
      await tx`delete from public.player_game_stats where save_id = ${id} and game_id = ${game.game_id} and team_id = ${game.home_team_id}`;
      await expect(readAwardRaces(tx, id, middle.calendar.season, middle.calendar.throughWeek)).rejects.toThrow('Missing player game statistics');
      await tx`update public.game_results set home_pass_yards = null where save_id = ${id} and game_id = ${game.game_id}`;
      await expect(readTeamRankings(tx, id, middle.calendar.season, middle.calendar.throughWeek)).rejects.toThrow('Missing team-ranking statistic');
      throw rollback;
    })).rejects.toBe(rollback);
  });
  it('agrees with actual postseason seeding and closes projected races when the bracket opens', async () => {
    while (phase === 'REGULAR_SEASON') await step();
    const save = await ownedSave(pipe.sql, owner, id);
    const projected = await readPlayoffPicture(pipe.sql, save);
    const actual = await loadSeeds(pipe.sql, id, save.season);
    expect(projected.conferences.flatMap((c) => c.teams.filter((t) => t.seed !== null)
      .map((t) => [t.teamId, t.seed])).sort()).toEqual(actual.map((t) => [t.teamId, t.seed]).sort());
    const closed = await read();
    expect(closed.picture).toBeNull(); expect(closed.races).toBeNull();
    expect(closed.calendar.phase).toBe('PLAYOFFS');
    expect(closed.rankings.every((b) => b.rows.length === 32)).toBe(true);
  }, 240_000);
});
