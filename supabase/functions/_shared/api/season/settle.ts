// Stage one of the offseason: the season is closed and the league settles.
//
// The book is written, the champion's players get their rings, everyone
// develops and ages, contracts run out, coaches are hired and fired, and the
// league votes on the year. Nobody has signed anywhere yet.
//
// Split from rollover.ts to keep that file about the order the stages run in.

import type { Db } from '../db.ts';
import { awardStream, rngSeed32, seasonWeeks, type SaveRow } from '../save.ts';
import { positionsFor, projectWorld } from '../project/index.ts';
import { coachSeasons, logCoachMoves, writeCoachHistory } from '../project/coachHistory.ts';
import { awardCandidates, coachCandidates, refreshRecords, writeAwards } from '../project/awards.ts';
import { logTransactions, snapshotPlayers, type TransactionCounts } from '../project/transactions.ts';
import { createRng } from '../../engine/rng.ts';
import { closeSeason, seasonRecords } from './close.ts';
import {
  runAwards, settleSeason, type CoachRecord, type League, type SettleResult,
} from '../../engine/offseason/index.ts';
import { OFFSEASON_STREAMS } from './streams.ts';

/** What settling produced, and what the later stages need from it. */
export interface SettleOutcome {
  readonly settle: SettleResult;
  readonly records: ReadonlyMap<string, CoachRecord>;
  readonly transactions: TransactionCounts;
  readonly coachesFired: number;
  readonly headCoachBefore: string | null;
}

/**
 * Games missed, from the two sources it takes to know.
 *
 * A player who produced a stat line is counted from his lines against his
 * club's games -- not against the weeks in the season, which would charge
 * every healthy starter for his club's bye. A player whose position produces
 * no line at all -- every offensive lineman, every long snapper -- is counted
 * from the injuries recorded against him. Counting him from lines said he had
 * missed the entire season, every season, and quietly accelerated the decline
 * of every lineman in the league.
 */
async function applyAvailability(
  db: Db, saveId: string, season: number, weeks: number, league: League,
): Promise<Map<string, number>> {
  const appearances = await db<{ player_id: string; n: string }[]>`
    select player_id, count(*) as n from public.player_game_stats
     where save_id = ${saveId} and season = ${season} and competition = 'REGULAR'
     group by player_id`;
  const linesBy = new Map(appearances.map((r) => [r.player_id, Number(r.n)]));
  const clubGames = new Map((await db<{ team_id: string; n: string }[]>`
    select team_id, count(*) as n from (
      select home_team_id as team_id from public.season_schedule
       where save_id = ${saveId} and season = ${season} and competition = 'REGULAR'
      union all
      select away_team_id from public.season_schedule
       where save_id = ${saveId} and season = ${season} and competition = 'REGULAR'
    ) g group by team_id`).map((r) => [r.team_id, Number(r.n)]));
  const missedByInjury = new Map((await db<{ player_id: string; missed: number }[]>`
    select player_id,
           greatest(0, least(weeks_out_estimate - 1, ${weeks} - injured_week))::int as missed
      from public.player_injuries
     where save_id = ${saveId} and injured_season = ${season}`)
    .map((r) => [r.player_id, r.missed]));

  for (const p of league.players) {
    if (p.teamId === null || p.retired) continue;
    const games = clubGames.get(p.teamId) ?? weeks - 1;
    const lines = linesBy.get(p.id);
    p.gamesMissedSeason = lines === undefined
      ? Math.min(games, missedByInjury.get(p.id) ?? 0)
      : Math.max(0, games - lines);
    p.gamesMissedCareer += p.gamesMissedSeason;
  }
  return new Map(league.players.map((p) => {
    const games = p.teamId === null ? weeks - 1 : clubGames.get(p.teamId) ?? weeks - 1;
    return [p.id, Math.max(0, games - p.gamesMissedSeason)];
  }));
}

/**
 * Stage one: the season is closed and the league settles.
 *
 * The book is written, the champion's players get their rings, everyone
 * develops and ages, contracts run out, coaches are hired and fired, and the
 * league votes on the year. Nobody has signed anywhere yet.
 */
export async function settleSeasonStage(
  db: Db, save: SaveRow, league: League,
): Promise<SettleOutcome> {
  const { id: saveId, season } = save;
  const weeks = await seasonWeeks(db, saveId, season);
  const seed32 = rngSeed32(save.rng_seed);
  const gamesPlayed = await applyAvailability(db, saveId, season, weeks, league);

  // The champion's players carry a ring into the offseason -- the one accolade
  // the career model counts. Read from the book the final wrote.
  const [champion] = await db<{ team_id: string }[]>`
    select team_id from public.league_history
     where save_id = ${saveId} and season = ${season} and playoff_result = 'CHAMPION'`;
  if (champion === undefined) {
    throw new Error(`The ${String(season)} season has no champion in league_history; the final was not played`);
  }
  for (const p of league.players) {
    if (p.teamId === champion.team_id && !p.retired) p.accolades.rings += 1;
  }

  const meanOverall = new Map<string, number>();
  for (const teamId of league.teamIds) {
    const squad = league.players.filter((p) => p.teamId === teamId && !p.retired);
    meanOverall.set(teamId, Math.round(
      (squad.reduce((a, p) => a + p.ability, 0) / Math.max(1, squad.length)) * 100) / 100);
  }
  await closeSeason(db, saveId, season, meanOverall);

  const before = snapshotPlayers(league);
  const positions = await positionsFor(db, saveId);
  // The staffs as the season ended, so a coach fired in the next paragraph
  // still has the season he coached attached to him.
  const staffBefore = league.coaches
    .filter((c) => !c.retired && c.teamId !== null)
    .map((c) => ({ coachId: c.id, name: c.name, teamId: c.teamId, role: c.role }));
  const records = await seasonRecords(db, saveId, season, league, weeks);
  const playoffResults = new Map(
    (await db<{ team_id: string; playoff_result: string | null }[]>`
      select team_id, playoff_result from public.league_history
       where save_id = ${saveId} and season = ${season}`)
      .flatMap((r) => (r.playoff_result === null ? [] : [[r.team_id, r.playoff_result] as const])));
  const headCoachBefore = league.coaches.find(
    (c) => c.teamId === save.user_team_id && c.role === 'HEAD_COACH')?.id ?? null;

  const settle = settleSeason(league, createRng(OFFSEASON_STREAMS.settle(seed32, season)), { records });

  await db`
    insert into public.player_season_grades (
      save_id, season, competition, player_id, team_id, position, snaps, grade, grade_z)
    select ${saveId}, ${season}, 'REGULAR', u.player_id, u.team_id, u.position, null, u.grade, u.grade_z
      from unnest(${settle.grades.map((g) => g.playerId)}::text[],
                  ${settle.grades.map((g) => before.get(g.playerId)?.teamId ?? null)}::text[],
                  ${settle.grades.map((g) => positions.get(g.playerId)?.position ?? null)}::text[],
                  ${settle.grades.map((g) => Math.min(100, Math.max(0, g.grade)))}::numeric[],
                  ${settle.grades.map((g) => g.gradeZ)}::numeric[])
        as u(player_id, team_id, position, grade, grade_z)
    on conflict (save_id, season, competition, player_id) do update
      set grade = excluded.grade, grade_z = excluded.grade_z, team_id = excluded.team_id`;

  await projectWorld(db, saveId, league, {
    previousIds: new Set(before.keys()), retired: settle.retired,
  });
  const transactions = await logTransactions(db, saveId, season, league, before, {
    retired: settle.retired, expired: settle.expired,
  });
  await writeCoachHistory(db, saveId, season,
    coachSeasons(staffBefore, settle.coaches.moves, records, playoffResults));
  await logCoachMoves(db, saveId, season, league, settle.coaches.moves);

  // The vote, on the season that was just played: its grades, its box scores,
  // its records. Its own stream, so a change to the offseason never moves a
  // ballot that was already cast.
  const awards = runAwards(
    season,
    await awardCandidates(db, saveId, season, league, settle.grades, gamesPlayed),
    coachCandidates(staffBefore, records),
    weeks - 1,
    createRng(awardStream(seed32, season)));
  const teamDuringSeason = new Map<string, string>();
  for (const [id, p] of before) {
    if (p.teamId !== null) teamDuringSeason.set(id, p.teamId);
  }
  await writeAwards(db, saveId, awards, teamDuringSeason);

  // An award is a career fact, not a screen: it goes on the player, where the
  // market reads it. Applied after development, so it moves what he is thought
  // to be worth from next season rather than retroactively.
  const byId = new Map(league.players.map((p) => [p.id, p]));
  for (const award of awards.awards) {
    const winner = award.winner.playerId === null ? undefined : byId.get(award.winner.playerId);
    if (winner !== undefined) winner.accolades.awards += 1;
  }
  for (const honour of awards.honours) {
    if (honour.team !== 'ALL_LEAGUE_FIRST') continue;
    const player = byId.get(honour.playerId);
    if (player !== undefined) player.accolades.allLeague += 1;
  }

  // The book, before anyone is asked to look at it. A season's totals are
  // final the moment the season is, so the career table and the record book
  // are rebuilt here rather than at camp -- which is three steps later, and
  // after the year has already been shown to the manager.
  await db`select public.refresh_player_career_totals(${saveId}::uuid)`;
  await refreshRecords(db, saveId);

  return {
    settle, records, transactions,
    coachesFired: settle.coaches.moves.filter((m) => m.kind === 'FIRED').length,
    headCoachBefore,
  };
}

