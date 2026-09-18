// Where the franchise stories get their facts.
//
// Kept apart from franchiseNews.ts so the sentences stay pure and testable and
// the queries stay in one place. Every field these gather is read back out of
// the rows that were just written -- the club's own identity row, the owner
// row, the schedule, the table -- rather than passed down from whatever was in
// memory at the time. A story assembled from a variable is a story that can
// disagree with the database it claims to describe.

import type { Db } from './db.ts';
import { profileRows } from './reads/teamBoard.ts';
import { num, overallRating, ownerMandate, quarterbackSituation, rounded } from './reads/teamOutlook.ts';
import { injuryCount, ownerRow } from './reads/dashboardQueries.ts';
import { POSITION_GROUPS } from '../engine/types.ts';
import type { ClubName, OpeningFacts, ResultFacts } from './franchiseNews.ts';

interface FixtureRow {
  game_id: string; home_team_id: string; away_team_id: string; neutral_site: boolean;
}

/**
 * Everything the four opening stories need, gathered inside the creating
 * transaction.
 *
 * Absences are passed through as nulls rather than filled in. A save created
 * without a GM name, a world with no owner row, a league whose schedule has
 * not been written -- each of those reaches openingStories() as the null it
 * is, and the story written about it says so.
 */
export async function openingFacts(
  db: Db, saveId: string, season: number, teamId: string, gmName: string | null,
): Promise<OpeningFacts | null> {
  const [profiles, owner, fixtures, injuries] = await Promise.all([
    profileRows(db, saveId, season),
    ownerRow(db, saveId, teamId),
    db<FixtureRow[]>`
      select game_id, home_team_id, away_team_id, neutral_site
        from public.season_schedule
       where save_id = ${saveId} and season = ${season} and week = 1
         and competition = 'REGULAR'
         and (home_team_id = ${teamId} or away_team_id = ${teamId})
       limit 1`,
    // The same count the dashboard's injury report shows, from the same
    // helper: who misses week 1 by the arithmetic the week runner benches
    // them with. A second predicate here would let camp and the injury report
    // disagree about the same players.
    injuryCount(db, saveId, season, 1, teamId, POSITION_GROUPS),
  ]);

  const mine = profiles.find((p) => p.team_id === teamId);
  // No identity row for the club being managed is not a missing fact to report
  // around -- it is a club with no name, and there is no story to write about
  // one. The caller treats null as "write nothing" rather than inventing a name.
  if (mine === undefined) return null;

  const club: ClubName = {
    teamId: mine.team_id, metro: mine.metro_area, nickname: mine.nickname,
  };
  const nameOf = new Map(profiles.map((p): [string, ClubName] => [
    p.team_id, { teamId: p.team_id, metro: p.metro_area, nickname: p.nickname },
  ]));

  const offense = rounded(mine.offense);
  const defense = rounded(mine.defense);
  const specialTeams = rounded(mine.special_teams);
  // The same derivation the dashboard's Owner Goal card prints. Two of them
  // would let the opening story ask for the playoffs while the card asks for
  // a rebuild, off one roster.
  const mandate = ownerMandate({
    patience: owner?.patience ?? null,
    winNowBias: num(owner?.win_now_bias ?? null),
    overall: overallRating(offense, defense, specialTeams),
    averageAge: rounded(mine.average_age),
    capSpace: num(mine.cap_space),
    quarterback: quarterbackSituation(
      mine.quarterback, mine.quarterback_age, mine.quarterback_backup),
  });

  const fixture = fixtures[0];
  const opponentId = fixture === undefined
    ? null
    : fixture.home_team_id === teamId ? fixture.away_team_id : fixture.home_team_id;
  const opponent = opponentId === null ? undefined : nameOf.get(opponentId);

  return {
    season,
    club,
    gmName,
    ownerName: owner?.owner_name ?? null,
    ownerTenure: owner?.tenure_years ?? null,
    mandate,
    rosterCount: Number(mine.roster_count ?? 0),
    campInjuries: Number(injuries?.out ?? 0),
    // A fixture whose opponent has no identity row is no better than no
    // fixture: the story would have to name a club it cannot name.
    opener: fixture === undefined || opponent === undefined
      ? null
      : {
        gameId: fixture.game_id,
        opponent,
        home: fixture.home_team_id === teamId,
        neutral: fixture.neutral_site,
      },
  };
}

/** One played game, as the week runner has it. */
export interface PlayedFor {
  readonly gameId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly overtime: boolean;
}

export interface StandingFor {
  readonly wins: number; readonly losses: number; readonly ties: number;
}

/**
 * The club's own result this week, if it played one.
 *
 * Returns null on a bye, on a week the club was already eliminated from, and
 * on a game whose two clubs cannot both be named -- none of which is a story,
 * and all of which would otherwise become one with a gap in it.
 */
export async function resultFacts(
  db: Db, saveId: string, season: number, week: number, phase: string,
  teamId: string, played: readonly PlayedFor[], standing: StandingFor | undefined,
): Promise<ResultFacts | null> {
  const game = played.find((g) => g.homeTeamId === teamId || g.awayTeamId === teamId);
  if (game === undefined || standing === undefined) return null;

  const home = game.homeTeamId === teamId;
  const opponentId = home ? game.awayTeamId : game.homeTeamId;
  const rows = await db<{ team_id: string; metro_area: string; nickname: string }[]>`
    select team_id, metro_area, nickname from public.teams
     where save_id = ${saveId} and team_id = any(${[teamId, opponentId]}::text[])`;
  const nameOf = new Map(rows.map((r): [string, ClubName] => [
    r.team_id, { teamId: r.team_id, metro: r.metro_area, nickname: r.nickname },
  ]));
  const club = nameOf.get(teamId);
  const opponent = nameOf.get(opponentId);
  if (club === undefined || opponent === undefined) return null;

  return {
    season, week, phase, club, opponent,
    gameId: game.gameId,
    ourScore: home ? game.homeScore : game.awayScore,
    theirScore: home ? game.awayScore : game.homeScore,
    home,
    overtime: game.overtime,
    wins: standing.wins, losses: standing.losses, ties: standing.ties,
  };
}
