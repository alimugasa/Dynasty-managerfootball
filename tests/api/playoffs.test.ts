// The postseason, against Postgres.
//
// One dynasty played through its whole season: eighteen weeks of football,
// the field seeded, four rounds, a champion, and the book closed. Every
// assertion is a row read back after the call returned.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { SeasonOutcome } from '../../supabase/functions/_shared/api/rollover';
import type { PlayoffsOut } from '../../supabase/functions/_shared/api/reads/playoffs';

const TEAM = 'BUF';
const PLAYOFF_USER = '55555555-0000-0000-0000-00000000dead';

describe('the postseason against Postgres', () => {
  let pipe: Pipe;
  let saveId = '';
  let season = 0;
  let champion = '';

  beforeAll(async () => {
    pipe = await openPipe(PLAYOFF_USER);
    const created = await pipe.api.call<CreateSaveOut>('create-save', { name: 'Bracket', teamId: TEAM });
    saveId = created.saveId;
    let outcome: WeekOutcome = { season: 0, week: 0, phase: 'REGULAR_SEASON', played: 0, abandoned: [], champion: null };
    while (outcome.phase === 'REGULAR_SEASON') {
      outcome = await pipe.api.call<WeekOutcome>('sim-week', { saveId });
    }
    season = outcome.season;
  }, 300_000);

  afterAll(async () => {
    await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  });

  it('seeds fourteen clubs, seven a conference, when the regular season ends', async () => {
    const [save] = await pipe.sql<{ phase: string }[]>`
      select phase from public.saves where id = ${saveId}`;
    expect(save?.phase).toBe('PLAYOFFS');

    const seeds = await pipe.sql<{ conference_id: string; conference_seed: number; playoff_status: string }[]>`
      select t.conference_id, st.conference_seed, st.playoff_status
        from public.standings st
        join public.teams t on t.save_id = st.save_id and t.team_id = st.team_id
       where st.save_id = ${saveId} and st.season = ${season} and st.conference_seed is not null
       order by t.conference_id, st.conference_seed`;
    expect(seeds.length).toBe(14);
    for (const conference of ['AC', 'NC']) {
      const mine = seeds.filter((s) => s.conference_id === conference);
      expect(mine.map((s) => s.conference_seed)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      // Four division winners at the top, the top seed resting.
      expect(mine.slice(0, 4).map((s) => s.playoff_status))
        .toEqual(['CLINCHED_BYE', 'CLINCHED_DIVISION', 'CLINCHED_DIVISION', 'CLINCHED_DIVISION']);
      expect(mine.slice(4).every((s) => s.playoff_status === 'CLINCHED_PLAYOFF')).toBe(true);
    }
    const [missed] = await pipe.sql<{ n: string }[]>`
      select count(*) as n from public.standings
       where save_id = ${saveId} and season = ${season}
         and conference_seed is null and eliminated`;
    expect(Number(missed?.n)).toBe(18);
  });

  it('opens with six ties and no club in two of them', async () => {
    const opening = await pipe.sql<{ home_team_id: string; away_team_id: string; neutral_site: boolean }[]>`
      select home_team_id, away_team_id, neutral_site from public.season_schedule
       where save_id = ${saveId} and season = ${season} and playoff_round = 'OPENING'`;
    expect(opening.length).toBe(6);
    const clubs = opening.flatMap((g) => [g.home_team_id, g.away_team_id]);
    expect(new Set(clubs).size).toBe(12);
    expect(opening.every((g) => !g.neutral_site)).toBe(true);
  });

  it('plays four rounds down to one champion, and no playoff game ends level', async () => {
    const rounds: { round: string; played: number }[] = [];
    let outcome: WeekOutcome = { season, week: 0, phase: 'PLAYOFFS', played: 0, abandoned: [], champion: null };
    while (outcome.phase === 'PLAYOFFS') {
      const before = await pipe.api.call<PlayoffsOut>('playoffs', { saveId });
      outcome = await pipe.api.call<WeekOutcome>('sim-week', { saveId });
      rounds.push({ round: before.nextRound ?? '', played: outcome.played });
    }
    expect(rounds.map((r) => r.round))
      .toEqual(['OPENING', 'QUARTERFINAL', 'CONFERENCE_FINAL', 'LEAGUE_FINAL']);
    expect(rounds.map((r) => r.played)).toEqual([6, 4, 2, 1]);
    expect(outcome.phase).toBe('OFFSEASON');
    expect(outcome.champion).not.toBeNull();
    champion = outcome.champion ?? '';

    const games = await pipe.sql<{ home_score: number; away_score: number }[]>`
      select home_score, away_score from public.game_results
       where save_id = ${saveId} and season = ${season} and competition = 'PLAYOFF'`;
    expect(games.length).toBe(13);
    expect(games.every((g) => g.home_score !== g.away_score)).toBe(true);

    const [final] = await pipe.sql<{ neutral_site: boolean }[]>`
      select neutral_site from public.season_schedule
       where save_id = ${saveId} and season = ${season} and playoff_round = 'LEAGUE_FINAL'`;
    expect(final?.neutral_site).toBe(true);
  }, 300_000);

  it('writes the book: one champion, one runner-up, eighteen who missed', async () => {
    const book = await pipe.sql<{ team_id: string; playoff_result: string; conference_seed: number | null }[]>`
      select team_id, playoff_result, conference_seed from public.league_history
       where save_id = ${saveId} and season = ${season}`;
    expect(book.length).toBe(32);
    const by = (result: string): string[] =>
      book.filter((r) => r.playoff_result === result).map((r) => r.team_id);
    expect(by('CHAMPION')).toEqual([champion]);
    expect(by('RUNNER_UP').length).toBe(1);
    expect(by('MISSED').length).toBe(18);
    expect(book.filter((r) => r.playoff_result === 'MISSED').every((r) => r.conference_seed === null)).toBe(true);
  });

  it('keeps the playoffs out of the table and the regular season\'s totals', async () => {
    const [table] = await pipe.sql<{ games: string }[]>`
      select sum(wins + losses + ties)::text as games from public.standings
       where save_id = ${saveId} and season = ${season}`;
    // 32 clubs, 17 games each: the postseason adds nothing to the table.
    expect(Number(table?.games)).toBe(32 * 17);
    const split = await pipe.sql<{ competition: string; n: string }[]>`
      select competition, count(*) as n from public.player_season_stats
       where save_id = ${saveId} and season = ${season} group by competition order by competition`;
    expect(split.map((r) => r.competition)).toEqual(['PLAYOFF', 'REGULAR']);
  });

  it('hands the champion its rings and rolls into the next season', async () => {
    const before = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.save_documents, jsonb_array_elements(document->'players') p
       where save_id = ${saveId} and (p->>'teamId') = ${champion} and (p->>'rings')::int > 0`;
    expect(Number(before[0]?.n)).toBe(0);

    const rolled = await pipe.api.call<SeasonOutcome>('advance-season', { saveId });
    expect(rolled.season).toBe(season + 1);

    const after = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.save_documents, jsonb_array_elements(document->'players') p
       where save_id = ${saveId} and (p->>'rings')::int > 0`;
    expect(Number(after[0]?.n)).toBeGreaterThan(0);
  }, 300_000);
});
