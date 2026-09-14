// team-profiles: the thirty-two clubs, as a scouting board.
//
// `clubs` answers "what are they called". This answers "which one would you
// take", which is a different and much more expensive question, so it is a
// different route: the club list is read by anything that needs a name and a
// colour, and this is read by the two screens where a manager is choosing.
//
// It reads the template world -- the starting league every save is cloned from
// -- because it is asked before any save exists. Two queries, aggregated in
// Postgres rather than in TypeScript: the alternative is thirty-two round
// trips or one enormous row set, and both are a second of waiting on the
// screen that is meant to feel like a decision.
//
// Every measure is nullable and every null means the same thing: the rows
// behind it are not there. The screen says so rather than printing a zero,
// because a club with no cap sheet and a club with no cap space are opposite
// facts.

import type { Handler } from '../context.ts';
import {
  groupRows, leagueShape, profileRows, type LeagueShape, type ProfileRow,
} from './teamBoard.ts';
import {
  draftLabel, draftScore, fanPressure, franchiseStatus, num, overallRating,
  ownerMood, quarterbackSituation, ratingBand, rosterTimeline, rounded,
  suggestedMove, type RatingBand,
} from './teamOutlook.ts';
import { shapeLeague, type TeamMeasure, type TeamTag } from './teamShape.ts';

/** A player named on the report. */
export interface NamedPlayer {
  readonly name: string;
  readonly position: string;
  readonly overall: number;
  /** Present on the young player, where his age is the point of the row. */
  readonly age?: number;
}

export interface TeamProfile {
  readonly teamId: string;
  /** The club's short form, which is also its id. Shown on the badge. */
  readonly abbreviation: string;
  readonly city: string;
  readonly teamName: string;
  readonly fullName: string;
  readonly conferenceId: string;
  readonly conferenceName: string;
  readonly divisionId: string;
  readonly divisionName: string;
  /** The division without the conference in front of it -- "North" out of
   *  "AC North" -- so a row can read "American Conference · North" rather than
   *  saying the conference twice or saying "AC · AC-N", which says nothing. */
  readonly divisionShort: string;
  readonly primary: string;
  readonly secondary: string;
  readonly overall: number | null;
  readonly offense: number | null;
  readonly defense: number | null;
  readonly specialTeams: number | null;
  readonly overallBand: RatingBand | null;
  readonly offenseBand: RatingBand | null;
  readonly defenseBand: RatingBand | null;
  readonly specialTeamsBand: RatingBand | null;
  readonly capSpace: number | null;
  readonly draftCapital: number | null;
  /** Draft capital out of 100, where 50 is the picks every club is given. */
  readonly draftScore: number | null;
  readonly draftLabel: string | null;
  readonly averageAge: number | null;
  readonly rosterCount: number | null;
  readonly quarterbackStatus: string | null;
  readonly ownerPatience: number | null;
  readonly ownerMood: string | null;
  readonly stadiumCapacity: number | null;
  /** How demanding the market is, from the only thing the world models about
   *  a crowd -- its size. Not a simulated fan base, and it does not pretend
   *  to be one. */
  readonly fanPressure: string | null;
  readonly marketSize: number | null;
  readonly bestPlayer: NamedPlayer | null;
  readonly youngPlayer: NamedPlayer | null;
  /** The position group this club is thinnest in, by the players who start. */
  readonly biggestWeakness: string | null;
  readonly rosterTimeline: string | null;
  readonly suggestedMove: string | null;
  readonly franchiseStatus: string | null;
  readonly archetype: string | null;
  readonly difficulty: string | null;
  readonly tags: readonly TeamTag[];
}

export interface TeamProfilesOut {
  readonly teams: readonly TeamProfile[];
  /** The season every new dynasty opens in. Read from the template rather than
   *  hardcoded on the client, because the template is what create-save clones
   *  and a client constant would drift the day a new seed ships. */
  readonly season: number;
  /** The shape of the competition a new dynasty opens into: how many clubs,
   *  conferences and divisions, how long the regular season runs, and how many
   *  draft picks are on the books. All counted, none of it stated. */
  readonly league: LeagueShape;
}

/** The seed's group names, as a scouting report would say them. */
const GROUP_LABEL: Readonly<Record<string, string>> = {
  Quarterback: 'Quarterback',
  Backfield: 'Backfield',
  Receiver: 'Receiver',
  'O-Line': 'Offensive line',
  'Front Seven': 'Front seven',
  Secondary: 'Secondary',
  Specialist: 'Special teams',
};

/** postgres.js hands back numerics and bigints as text so no digit is lost on
 *  the way. Nothing downstream may see the string. */
/** "AC North" under conference AC is "North". A division whose name does not
 *  start with its conference is returned whole rather than cut at a guess. */
export function shortDivision(name: string, conferenceId: string): string {
  const prefix = `${conferenceId} `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

function named(
  name: string | null, position: string | null, overall: number | null, age?: number | null,
): NamedPlayer | null {
  // All three or none: half a player on a scouting report is worse than no
  // player, because it reads as a name whose rating we chose not to show.
  if (name === null || position === null || overall === null) return null;
  return { name, position, overall, ...(age === null || age === undefined ? {} : { age }) };
}

export const teamProfiles: Handler<Record<string, never>, TeamProfilesOut> = {
  auth: 'required',
  parse: () => ({}),
  run: async ({ sql }) => {
    const [template] = await sql<{ id: string; season: number }[]>`
      select id, season from public.saves where is_template`;
    if (template === undefined) throw new Error('No template world has been imported');

    const [rows, groups, league] = await Promise.all([
      profileRows(sql, template.id, template.season),
      groupRows(sql, template.id),
      leagueShape(sql, template.id, template.season),
    ]);

    // The thinnest room on each club. Read from the group ratings rather than
    // from the unit ratings, because "offence is weaker than defence" is not
    // something a manager can do anything about and "the offensive line is"
    // is.
    //
    // Measured against the league's own average for that group, not against
    // the club's other groups. Rated flat, specialists come out lowest almost
    // everywhere -- the first cut of this called special teams the biggest
    // weakness on nineteen of thirty-two clubs, which is a fact about how
    // kickers are rated and not about any of those clubs. What a manager can
    // act on is where this club is furthest behind everyone else's version of
    // the same room.
    const leagueMean = new Map<string, { total: number; n: number }>();
    for (const g of groups) {
      const rating = num(g.rating);
      if (rating === null) continue;
      const held = leagueMean.get(g.position_group) ?? { total: 0, n: 0 };
      leagueMean.set(g.position_group, { total: held.total + rating, n: held.n + 1 });
    }
    const weakest = new Map<string, { group: string; behind: number }>();
    for (const g of groups) {
      const rating = num(g.rating);
      const mean = leagueMean.get(g.position_group);
      if (rating === null || mean === undefined || mean.n === 0) continue;
      const behind = rating - mean.total / mean.n;
      const held = weakest.get(g.team_id);
      if (held === undefined || behind < held.behind) {
        weakest.set(g.team_id, { group: g.position_group, behind });
      }
    }

    const measures: TeamMeasure[] = rows.map((r: ProfileRow) => {
      const offense = rounded(r.offense);
      const defense = rounded(r.defense);
      const specialTeams = rounded(r.special_teams);
      return {
        teamId: r.team_id,
        offense, defense, specialTeams,
        overall: overallRating(offense, defense, specialTeams),
        averageAge: rounded(r.average_age),
        capSpace: num(r.cap_space),
        draftCapital: num(r.draft_capital),
        quarterback: r.quarterback,
      };
    });

    const shapes = shapeLeague(measures);

    return {
      season: template.season,
      league,
      teams: rows.map((r, i) => {
        const m = measures[i] as TeamMeasure;
        const shape = shapes.get(r.team_id);
        const score = draftScore(m.draftCapital);
        const quarterback = quarterbackSituation(
          r.quarterback, r.quarterback_age, r.quarterback_backup);
        const thin = weakest.get(r.team_id);
        const weakness = thin === undefined
          ? null
          : GROUP_LABEL[thin.group] ?? thin.group;
        const outlook = {
          offense: m.offense, defense: m.defense, overall: m.overall,
          averageAge: m.averageAge, capSpace: m.capSpace, draft: score,
          quarterback, weakest: weakness,
          weakestBehind: thin === undefined ? null : Math.round(thin.behind * 10) / 10,
        };
        return {
          teamId: r.team_id, abbreviation: r.team_id,
          city: r.metro_area, teamName: r.nickname,
          fullName: `${r.metro_area} ${r.nickname}`.trim(),
          conferenceId: r.conference_id, conferenceName: r.conference_name,
          divisionId: r.division_id, divisionName: r.division_name,
          divisionShort: shortDivision(r.division_name, r.conference_id),
          primary: r.primary_color, secondary: r.secondary_color,
          overall: m.overall, offense: m.offense, defense: m.defense,
          specialTeams: m.specialTeams,
          overallBand: ratingBand(m.overall),
          offenseBand: ratingBand(m.offense),
          defenseBand: ratingBand(m.defense),
          specialTeamsBand: ratingBand(m.specialTeams),
          capSpace: m.capSpace,
          draftCapital: m.draftCapital,
          draftScore: score,
          draftLabel: draftLabel(score),
          averageAge: m.averageAge,
          rosterCount: num(r.roster_count),
          quarterbackStatus: quarterback,
          ownerPatience: r.owner_patience,
          ownerMood: ownerMood(r.owner_patience),
          stadiumCapacity: r.stadium_capacity,
          fanPressure: fanPressure(r.market_size),
          marketSize: r.market_size,
          bestPlayer: named(r.best_name, r.best_position, r.best_overall),
          youngPlayer: named(r.young_name, r.young_position, r.young_overall, r.young_age),
          biggestWeakness: weakness,
          rosterTimeline: rosterTimeline(outlook),
          suggestedMove: suggestedMove(outlook),
          franchiseStatus: franchiseStatus(outlook, shape?.difficulty ?? null),
          archetype: shape?.archetype ?? null,
          difficulty: shape?.difficulty ?? null,
          tags: shape?.tags ?? [],
        };
      }),
    };
  },
};
