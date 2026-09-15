// The end of the year, as rows: awards, the ballots behind them, the two
// all-league teams and the two all-star rosters.
//
// The engine votes; this reads the season the vote is about and stores the
// result. What a voter is told is the season that was actually played -- the
// grade the engine gave it, the production the box scores recorded, the games
// the player was on the field for, and what his club won -- rather than the
// rating he happens to hold now.

import type { Db } from '../db.ts';
import type {
  Award, AwardCandidate, AwardResult, CoachCandidate, League, SeasonGrade,
} from '../../engine/offseason/index.ts';
import type { PositionGroup } from '../../engine/types.ts';

interface StatRow {
  player_id: string; team_id: string; games_played: number;
  pass_yards: number | null; rush_yards: number | null; rec_yards: number | null;
  pass_tds: number | null; rush_tds: number | null; rec_tds: number | null;
  sacks: string | null; ints_caught: number | null; tackles: number | null;
}

/**
 * Everyone who played, as a voter sees them.
 *
 * The population is everyone the engine graded, not everyone who appears in
 * the box scores: an offensive lineman produces no statistic and still has a
 * season, and a ballot drawn from the stats table alone could never put one on
 * an all-league team. Production is joined on where it exists.
 *
 * A rookie drafted this spring has no grade for the season being voted on and
 * is therefore not a candidate for it.
 */
export async function awardCandidates(
  db: Db, saveId: string, season: number, league: League, grades: readonly SeasonGrade[],
  gamesPlayed: ReadonlyMap<string, number>,
): Promise<AwardCandidate[]> {
  const stats = await db<StatRow[]>`
    select player_id, team_id, games_played, pass_yards, rush_yards, rec_yards,
           pass_tds, rush_tds, rec_tds, sacks::text as sacks, ints_caught, tackles
      from public.player_season_stats
     where save_id = ${saveId} and season = ${season} and competition = 'REGULAR'`;
  const wins = new Map((await db<{ team_id: string; wins: number }[]>`
    select team_id, wins from public.standings
     where save_id = ${saveId} and season = ${season}`).map((r) => [r.team_id, r.wins]));
  // Which conference each team plays in: an all-star roster is picked inside
  // one, and the engine cannot know the map -- it holds no league structure.
  const conferenceOf = new Map((await db<{ team_id: string; conference_id: string }[]>`
    select team_id, conference_id from public.teams
     where save_id = ${saveId}`).map((r) => [r.team_id, r.conference_id]));
  const statOf = new Map(stats.map((r) => [r.player_id, r]));
  const playerOf = new Map(league.players.map((p) => [p.id, p]));

  return grades.flatMap((grade) => {
    const player = playerOf.get(grade.playerId);
    // A grade with no player is a document that has drifted from itself; it is
    // skipped rather than voted on for a player who is not there.
    if (player === undefined) return [];
    const row = statOf.get(grade.playerId);
    // The club he played for: the stats row where there is one, and otherwise
    // the club he is on now, which for a player nobody moved is the same club.
    const teamId = row?.team_id ?? player.teamId;
    if (teamId === null || teamId === undefined) return [];
    const n = (value: number | null | undefined): number => value ?? 0;
    return [{
      // A team the league does not place in a conference leaves this empty,
      // and selectAllStars skips it rather than inventing a roster for it.
      conferenceId: conferenceOf.get(teamId) ?? '',
      playerId: grade.playerId,
      name: player.name,
      teamId,
      group: player.group as PositionGroup,
      grade: grade.grade,
      gradeZ: grade.gradeZ,
      // The offseason has already aged him a year; the season being voted on
      // is the one before that.
      experience: Math.max(0, player.experience - 1),
      games: row?.games_played ?? gamesPlayed.get(grade.playerId) ?? 0,
      teamWins: wins.get(teamId) ?? 0,
      passYards: n(row?.pass_yards),
      rushYards: n(row?.rush_yards),
      recYards: n(row?.rec_yards),
      touchdowns: n(row?.pass_tds) + n(row?.rush_tds) + n(row?.rec_tds),
      sacks: Number(row?.sacks ?? '0'),
      interceptions: n(row?.ints_caught),
      tackles: n(row?.tackles),
    }];
  });
}

/** The head coaches who worked the season, against what their rosters said. */
export function coachCandidates(
  staff: readonly { readonly coachId: string; readonly name: string; readonly teamId: string | null; readonly role: string | null }[],
  records: ReadonlyMap<string, { wins: number; losses: number; expectedWins: number }>,
): CoachCandidate[] {
  return staff.flatMap((c) => {
    if (c.role !== 'HEAD_COACH' || c.teamId === null) return [];
    const record = records.get(c.teamId);
    if (record === undefined) return [];
    return [{
      coachId: c.coachId, name: c.name, teamId: c.teamId,
      wins: record.wins, losses: record.losses, expectedWins: record.expectedWins,
    }];
  });
}

export async function writeAwards(
  db: Db, saveId: string, result: AwardResult, teamOf: ReadonlyMap<string, string>,
): Promise<void> {
  if (result.awards.length > 0) {
    const col = <T>(f: (a: Award) => T): T[] => result.awards.map(f);
    await db`
      insert into public.awards (
        save_id, season, award_code, award_name, player_id, coach_id, team_id,
        player_name, team_abbr, vote_share)
      select ${saveId}, ${result.season}, u.code, u.name, u.player_id, u.coach_id,
             u.team_id, u.winner, u.team_id, u.share
        from unnest(
          ${col((a) => a.code)}::text[], ${col((a) => a.name)}::text[],
          ${col((a) => a.winner.playerId)}::text[], ${col((a) => a.winner.coachId)}::text[],
          ${col((a) => a.winner.teamId)}::text[], ${col((a) => a.winner.name)}::text[],
          ${col((a) => a.winner.voteShare)}::numeric[]
        ) as u(code, name, player_id, coach_id, team_id, winner, share)
      on conflict (save_id, season, award_code) do update
        set award_name = excluded.award_name, player_id = excluded.player_id,
            coach_id = excluded.coach_id, team_id = excluded.team_id,
            player_name = excluded.player_name, team_abbr = excluded.team_abbr,
            vote_share = excluded.vote_share`;

    const ballots = result.awards.flatMap((a) => a.ballot.map((b) => ({ code: a.code, b })));
    const bcol = <T>(f: (row: { code: string; b: Award['winner'] }) => T): T[] => ballots.map(f);
    await db`
      insert into public.award_ballots (
        save_id, season, award_code, finish_rank, player_id, coach_id,
        player_name, team_abbr, vote_share)
      select ${saveId}, ${result.season}, u.code, u.rank, u.player_id, u.coach_id,
             u.name, u.team_id, u.share
        from unnest(
          ${bcol((r) => r.code)}::text[], ${bcol((r) => r.b.rank)}::int[],
          ${bcol((r) => r.b.playerId)}::text[], ${bcol((r) => r.b.coachId)}::text[],
          ${bcol((r) => r.b.name)}::text[], ${bcol((r) => r.b.teamId)}::text[],
          ${bcol((r) => r.b.voteShare)}::numeric[]
        ) as u(code, rank, player_id, coach_id, name, team_id, share)
      on conflict (save_id, season, award_code, finish_rank) do update
        set player_id = excluded.player_id, coach_id = excluded.coach_id,
            player_name = excluded.player_name, team_abbr = excluded.team_abbr,
            vote_share = excluded.vote_share`;
  }

  if (result.honours.length === 0) return;
  const hcol = <T>(f: (h: AwardResult['honours'][number]) => T): T[] => result.honours.map(f);
  await db`
    insert into public.honours (
      save_id, season, honour_type, team_unit, position, slot,
      player_id, player_name, team_abbr)
    select ${saveId}, ${result.season}, u.type, u.unit, u.position, u.slot,
           u.player_id, u.name, u.team_id
      from unnest(
        ${hcol((h) => h.team)}::text[], ${hcol((h) => h.unit)}::text[],
        ${hcol((h) => h.group)}::text[], ${hcol((h) => h.slot)}::int[],
        ${hcol((h) => h.playerId)}::text[], ${hcol((h) => h.name)}::text[],
        ${hcol((h) => teamOf.get(h.playerId) ?? h.teamId)}::text[]
      ) as u(type, unit, position, slot, player_id, name, team_id)
    on conflict (save_id, season, honour_type, team_unit, position, slot) do update
      set player_id = excluded.player_id, player_name = excluded.player_name,
          team_abbr = excluded.team_abbr, team_unit = excluded.team_unit`;
}

/**
 * The record book, recomputed from the seasons that have been played.
 *
 * Every record is a maximum over rows already stored, so it is computed where
 * the rows are rather than in the engine: there is no football decision here,
 * only arithmetic over facts. A record that has never been set has no row,
 * rather than a row holding zero.
 */
export async function refreshRecords(db: Db, saveId: string): Promise<void> {
  // Two column names per record, because the two tables count different
  // things under the same word: player_season_stats.interceptions is what a
  // passer threw, and ints_caught is what a defender took. The career table
  // has no column for the second, so that record is single-season only rather
  // than being filled with the wrong number.
  const columns: readonly {
    readonly code: string; readonly name: string;
    readonly column: string; readonly careerColumn: string | null;
  }[] = [
    { code: 'PASS_YARDS', name: 'Passing yards', column: 'pass_yards', careerColumn: 'pass_yards' },
    { code: 'RUSH_YARDS', name: 'Rushing yards', column: 'rush_yards', careerColumn: 'rush_yards' },
    { code: 'REC_YARDS', name: 'Receiving yards', column: 'rec_yards', careerColumn: 'rec_yards' },
    { code: 'SACKS', name: 'Sacks', column: 'sacks', careerColumn: 'sacks' },
    { code: 'PASS_TDS', name: 'Passing touchdowns', column: 'pass_tds', careerColumn: 'pass_tds' },
    { code: 'RUSH_TDS', name: 'Rushing touchdowns', column: 'rush_tds', careerColumn: 'rush_tds' },
    { code: 'REC_TDS', name: 'Receiving touchdowns', column: 'rec_tds', careerColumn: 'rec_tds' },
    { code: 'INTERCEPTIONS', name: 'Interceptions caught', column: 'ints_caught', careerColumn: null },
  ];
  for (const { code, name, column, careerColumn } of columns) {
    await db`
      insert into public.league_records (
        save_id, record_code, scope, competition, record_name, value,
        player_id, player_name, team_abbr, season, set_at_season)
      select ${saveId}, ${code}, 'SINGLE_SEASON', 'REGULAR', ${name},
             s.${db(column)}, s.player_id, p.display_name, s.team_id, s.season, s.season
        from public.player_season_stats s
        join public.players p on p.save_id = s.save_id and p.player_id = s.player_id
       where s.save_id = ${saveId} and s.competition = 'REGULAR' and s.${db(column)} > 0
       order by s.${db(column)} desc, s.player_id limit 1
      on conflict (save_id, record_code, scope, competition) do update
        set value = excluded.value, player_id = excluded.player_id,
            player_name = excluded.player_name, team_abbr = excluded.team_abbr,
            season = excluded.season, set_at_season = excluded.set_at_season
        where excluded.value > public.league_records.value`;

    if (careerColumn === null) continue;
    await db`
      insert into public.league_records (
        save_id, record_code, scope, competition, record_name, value,
        player_id, player_name, team_abbr, season, set_at_season)
      select ${saveId}, ${code}, 'CAREER', 'REGULAR', ${name},
             c.${db(careerColumn)}, c.player_id, p.display_name, null, null, c.last_season
        from public.player_career_totals c
        join public.players p on p.save_id = c.save_id and p.player_id = c.player_id
       where c.save_id = ${saveId} and c.competition = 'REGULAR' and c.${db(careerColumn)} > 0
       order by c.${db(careerColumn)} desc, c.player_id limit 1
      on conflict (save_id, record_code, scope, competition) do update
        set value = excluded.value, player_id = excluded.player_id,
            player_name = excluded.player_name, season = excluded.season,
            set_at_season = excluded.set_at_season
        where excluded.value > public.league_records.value`;
  }
}
