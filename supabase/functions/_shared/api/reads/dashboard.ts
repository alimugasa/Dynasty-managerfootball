// dashboard: the franchise home screen, in one call.
//
// The first screen after the world is built and the one a manager opens every
// week, so it answers every question that screen asks at once rather than
// making six round trips on the slowest connection the game will ever be
// played on: who you are, what you are rated, how the season is going, who you
// play next, what the owner asked for, and what is left to do before kick-off.
//
// It reads the same aggregate the scouting board reads (teamBoard.ts), scoped
// to this save instead of the template. That is deliberate rather than lazy:
// the ratings a manager saw when they chose the club must be the ratings the
// dashboard shows on day one, and one query producing both is the only way
// that stays true. It also hands over the next opponent's rating, which is
// what the matchup line is read from.
//
// Every measure is nullable and every null means the rows behind it are not
// there. A club with no cap sheet and a club with no cap space are opposite
// facts, and the screen prints them differently.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { parseStreak } from '../project/standings.ts';
import { POSITION_GROUPS } from '../../engine/types.ts';
import { ROUND_LABEL, type PlayoffRound } from '../../engine/playoffs.ts';
import { OFFSEASON_PHASES } from '../phases.ts';
import { profileRows, type ProfileRow } from './teamBoard.ts';
import { shortDivision } from './teamProfiles.ts';
import {
  fanPressure, mandateStanding, matchupDifficulty, num, overallRating, ownerMandate,
  ownerMood, quarterbackSituation, ratingBand, rosterTimeline, rounded, strongestUnit,
  type Mandate, type RatingBand,
} from './teamOutlook.ts';
import {
  injuryCount, lastResult, marginRows, ownerRow, shapeRow, standingRows, turnoverRow,
  weekFixture, type MarginRow,
} from './dashboardQueries.ts';
import type { SquadRow } from './team.ts';

export interface DashboardIn { readonly saveId: string }

export interface IdentityOut {
  readonly teamId: string;
  readonly city: string;
  readonly teamName: string;
  readonly fullName: string;
  readonly conferenceName: string;
  readonly divisionName: string;
  /** "North", not "AC North": the conference is already on the line. */
  readonly divisionShort: string;
  readonly primary: string;
  readonly secondary: string;
}

export interface RatingsOut {
  readonly overall: number | null;
  readonly offense: number | null;
  readonly defense: number | null;
  readonly specialTeams: number | null;
  readonly overallBand: RatingBand | null;
  readonly offenseBand: RatingBand | null;
  readonly defenseBand: RatingBand | null;
  readonly specialTeamsBand: RatingBand | null;
}

export interface RecordOut {
  readonly wins: number; readonly losses: number; readonly ties: number;
  readonly pointsFor: number; readonly pointsAgainst: number;
  readonly differential: number;
  readonly streak: number;
  readonly played: number;
}

export interface TurnoverOut {
  readonly taken: number; readonly given: number; readonly differential: number;
}

export interface OwnerOut {
  readonly name: string;
  readonly archetype: string | null;
  readonly tenureYears: number | null;
  /** 0-100 from the owner row. Null where the world shipped no owner. */
  readonly patience: number | null;
  /** What that patience means, in two or three words. */
  readonly mood: string | null;
  readonly mandate: Mandate | null;
  /** Where the record stands against the mandate. Null before a game is
   *  played, and null for the mandates a win column cannot judge. */
  readonly standing: string | null;
}

/** What is on for this week, and why there is nothing where there is nothing.
 *
 *  The four states are different facts and the screen draws them differently:
 *  a bye is the calendar working, an empty fixture list is a broken world. */
export type WeekState = 'FIXTURE' | 'BYE' | 'NO_SCHEDULE' | 'SEASON_OVER';

export interface ThisWeekOut {
  readonly state: WeekState;
  readonly week: number;
  readonly gameId: string | null;
  readonly opponentId: string | null;
  readonly opponentName: string | null;
  readonly opponentRecord: { readonly wins: number; readonly losses: number; readonly ties: number } | null;
  readonly opponentOverall: number | null;
  readonly opponentBand: RatingBand | null;
  readonly opponentOffense: number | null;
  readonly opponentDefense: number | null;
  readonly opponentSpecialTeams: number | null;
  /** Which of their three units is their best, named. */
  readonly opponentStrongest: string | null;
  /** True when the club you manage is at home. Null when there is no game. */
  readonly home: boolean | null;
  readonly difficulty: string | null;
  /** The round's name on a playoff fixture; null in the regular season. */
  readonly round: string | null;
}

/** The counts the checklist reads. Facts about rows, never about the player. */
export interface ShapeOut {
  readonly rosterCount: number;
  readonly depthGroups: number;
  readonly depthStarters: number;
  readonly positionGroups: number;
  readonly fixtures: number;
  readonly played: number;
}

/** A result worth naming: the biggest win, or the heaviest defeat. */
export interface MarginOut {
  readonly gameId: string;
  readonly week: number;
  readonly opponentId: string;
  readonly teamScore: number;
  readonly opponentScore: number;
  readonly margin: number;
}

/** The game just played, for the screen that played it. */
export interface LastResultOut {
  readonly gameId: string;
  readonly week: number;
  readonly round: string | null;
  readonly opponentId: string;
  readonly home: boolean;
  readonly teamScore: number;
  readonly opponentScore: number;
}

export interface DashboardOut {
  readonly identity: IdentityOut;
  readonly season: number;
  readonly week: number;
  readonly phase: string;
  readonly ratings: RatingsOut;
  readonly record: RecordOut | null;
  /** League position by record, 1 = best. Null before a game is played. */
  readonly rank: number | null;
  /** How many clubs that rank is out of. Counted, not assumed to be 32. */
  readonly teams: number;
  readonly capSpace: number | null;
  readonly averageAge: number | null;
  /** How long before this roster is the one that wins. */
  readonly status: string | null;
  readonly quarterback: string | null;
  readonly turnovers: TurnoverOut | null;
  readonly owner: OwnerOut | null;
  /** How many of the club's players miss this week, and how many of those are
   *  first in line in their group. Counted with the same arithmetic the
   *  simulation uses, so the report and the game agree. */
  readonly injuries: number;
  readonly injuredStarters: number;
  /** How demanding the market is, from the only thing the world models about
   *  a crowd -- its size. Not a simulated fan base. */
  readonly fanPressure: string | null;
  readonly last: LastResultOut | null;
  /** Where the club sits in the bracket, once there is one. Null through the
   *  regular season and null for a club that missed it -- the screen tells the
   *  two apart by the phase, not by guessing. */
  readonly seed: number | null;
  readonly bestWin: MarginOut | null;
  readonly worstLoss: MarginOut | null;
  readonly thisWeek: ThisWeekOut;
  readonly shape: ShapeOut;
  /** The top of the depth chart, in the order it plays. */
  readonly squad: readonly SquadRow[];
}

const asMargin = (row: MarginRow | undefined): MarginOut | null => (row === undefined ? null : {
  gameId: row.game_id, week: row.week, opponentId: row.opponent,
  teamScore: row.team_score, opponentScore: row.opponent_score, margin: row.margin,
});

/** The season is over for a club whose phase has left the football behind.
 *  Taken from the offseason's own list rather than written out again here: a
 *  phase added there and missed here would draw a bye over a finished year. */
const DONE = new Set<string>(OFFSEASON_PHASES);

export const dashboard: Handler<DashboardIn, DashboardOut> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const teamId = s.user_team_id;

    const [profiles, standings, owner, shape, turnovers, fixture, injuries, last] =
      await Promise.all([
        profileRows(sql, s.id, s.season),
        standingRows(sql, s.id, s.season),
        ownerRow(sql, s.id, teamId),
        shapeRow(sql, s.id, s.season, teamId, POSITION_GROUPS),
        turnoverRow(sql, s.id, s.season, teamId),
        weekFixture(sql, s.id, s.season, s.week, teamId),
        injuryCount(sql, s.id, s.season, s.week, teamId, POSITION_GROUPS),
        lastResult(sql, s.id, s.season, teamId),
      ]);
    const margins = await marginRows(sql, s.id, s.season, teamId);

    const squad = await sql<{
      player_id: string; display_name: string; slot: string; age: number; overall_rating: number;
    }[]>`
      select d.player_id, p.display_name, d.slot, p.age, p.overall_rating
        from public.team_depth_charts d
        join public.players p on p.save_id = d.save_id and p.player_id = d.player_id
       where d.save_id = ${s.id} and d.team_id = ${teamId}
         and d.slot = any(${[...POSITION_GROUPS]}::text[])
       order by array_position(${[...POSITION_GROUPS]}::text[], d.slot), d.depth_order
       limit 5`;

    /** A club's three units and the one number they add up to. */
    const rate = (row: ProfileRow | undefined) => {
      const offense = rounded(row?.offense ?? null);
      const defense = rounded(row?.defense ?? null);
      const specialTeams = rounded(row?.special_teams ?? null);
      return { offense, defense, specialTeams, overall: overallRating(offense, defense, specialTeams) };
    };

    const mine = profiles.find((r) => r.team_id === teamId);
    const standing = standings.find((r) => r.team_id === teamId);
    const played = standing === undefined
      ? 0 : standing.wins + standing.losses + standing.ties;
    const rated = rate(mine);
    const averageAge = rounded(mine?.average_age ?? null);
    const capSpace = num(mine?.cap_space ?? null);
    const quarterback = quarterbackSituation(
      mine?.quarterback ?? null, mine?.quarterback_age ?? null, mine?.quarterback_backup ?? null);

    const mandate = ownerMandate({
      patience: owner?.patience ?? null,
      winNowBias: num(owner?.win_now_bias ?? null),
      overall: rated.overall,
      averageAge,
      capSpace,
      quarterback,
    });

    // This week, in four states. The fixture list being empty is the only one
    // that is a fault rather than a fact, and it is reported as its own state
    // so the screen can say so instead of drawing a bye.
    const opponentId = fixture === undefined
      ? null
      : fixture.home_team_id === teamId ? fixture.away_team_id : fixture.home_team_id;
    const opponent = opponentId === null ? undefined : profiles.find((r) => r.team_id === opponentId);
    const opponentStanding = opponentId === null
      ? undefined : standings.find((r) => r.team_id === opponentId);
    const opponentRated = rate(opponent);
    const state: WeekState = fixture !== undefined
      ? 'FIXTURE'
      : DONE.has(s.phase) ? 'SEASON_OVER'
        : Number(shape?.fixtures ?? '0') === 0 ? 'NO_SCHEDULE' : 'BYE';

    const giveaways = num(turnovers?.giveaways ?? null);
    const takeaways = num(turnovers?.takeaways ?? null);

    return {
      identity: {
        teamId,
        city: mine?.metro_area ?? '',
        teamName: mine?.nickname ?? teamId,
        fullName: `${mine?.metro_area ?? ''} ${mine?.nickname ?? teamId}`.trim(),
        conferenceName: mine?.conference_name ?? '',
        divisionName: mine?.division_name ?? '',
        divisionShort: mine === undefined
          ? '' : shortDivision(mine.division_name, mine.conference_id),
        primary: mine?.primary_color ?? '',
        secondary: mine?.secondary_color ?? '',
      },
      season: s.season,
      week: s.week,
      phase: s.phase,
      ratings: {
        ...rated,
        overallBand: ratingBand(rated.overall),
        offenseBand: ratingBand(rated.offense),
        defenseBand: ratingBand(rated.defense),
        specialTeamsBand: ratingBand(rated.specialTeams),
      },
      record: standing === undefined ? null : {
        wins: standing.wins, losses: standing.losses, ties: standing.ties,
        pointsFor: standing.points_for, pointsAgainst: standing.points_against,
        differential: standing.points_for - standing.points_against,
        streak: parseStreak(standing.streak),
        played,
      },
      // Before anybody has played, every club is level and the order is only
      // the tie-break. A position nobody has earned is not a fact.
      rank: standing === undefined || played === 0 ? null : Number(standing.rank),
      teams: profiles.length,
      capSpace,
      averageAge,
      status: rosterTimeline({
        offense: rated.offense, defense: rated.defense, overall: rated.overall,
        averageAge, capSpace, draft: null, quarterback,
        weakest: null, weakestBehind: null,
      }),
      quarterback,
      // A season with no games has no differential; a season whose box scores
      // recorded no turnovers has none either, and both say so rather than
      // printing a nought.
      turnovers: giveaways === null || takeaways === null || played === 0
        ? null
        : { taken: takeaways, given: giveaways, differential: takeaways - giveaways },
      owner: owner === undefined ? null : {
        name: owner.owner_name,
        archetype: owner.archetype,
        tenureYears: owner.tenure_years,
        patience: owner.patience,
        mood: ownerMood(owner.patience),
        mandate,
        standing: standing === undefined
          ? null
          : mandateStanding(mandate, standing.wins, standing.losses, standing.ties),
      },
      thisWeek: {
        state,
        week: s.week,
        gameId: fixture?.game_id ?? null,
        opponentId,
        opponentName: opponent === undefined
          ? null : `${opponent.metro_area} ${opponent.nickname}`.trim(),
        opponentRecord: opponentStanding === undefined ? null : {
          wins: opponentStanding.wins, losses: opponentStanding.losses, ties: opponentStanding.ties,
        },
        opponentOverall: opponentRated.overall,
        opponentBand: ratingBand(opponentRated.overall),
        opponentOffense: opponentRated.offense,
        opponentDefense: opponentRated.defense,
        opponentSpecialTeams: opponentRated.specialTeams,
        opponentStrongest: strongestUnit(
          opponentRated.offense, opponentRated.defense, opponentRated.specialTeams),
        home: fixture === undefined ? null : fixture.home_team_id === teamId,
        difficulty: matchupDifficulty(rated.overall, opponentRated.overall),
        round: fixture?.playoff_round == null
          ? null
          : (ROUND_LABEL[fixture.playoff_round as PlayoffRound] ?? fixture.playoff_round),
      },
      injuries: Number(injuries?.out ?? '0'),
      injuredStarters: Number(injuries?.starters ?? '0'),
      fanPressure: fanPressure(mine?.market_size ?? null),
      last: last === undefined ? null : {
        gameId: last.game_id,
        week: last.week,
        round: last.playoff_round === null
          ? null
          : (ROUND_LABEL[last.playoff_round as PlayoffRound] ?? last.playoff_round),
        opponentId: last.home_team_id === teamId ? last.away_team_id : last.home_team_id,
        home: last.home_team_id === teamId,
        teamScore: last.home_team_id === teamId ? last.home_score : last.away_score,
        opponentScore: last.home_team_id === teamId ? last.away_score : last.home_score,
      },
      seed: standing?.conference_seed ?? null,
      bestWin: asMargin(margins.find((m) => m.margin > 0)),
      worstLoss: asMargin(margins.find((m) => m.margin < 0)),
      shape: {
        rosterCount: Number(shape?.roster ?? '0'),
        depthGroups: Number(shape?.groups ?? '0'),
        depthStarters: Number(shape?.starters ?? '0'),
        positionGroups: POSITION_GROUPS.length,
        fixtures: Number(shape?.fixtures ?? '0'),
        played: Number(shape?.played ?? '0'),
      },
      squad: squad.map((r) => ({
        playerId: r.player_id, name: r.display_name, group: r.slot, age: r.age,
        overall: r.overall_rating,
      })),
    };
  },
};
