// team-profiles: the thirty-two clubs, as a scouting board.
//
// `clubs` answers "what are they called". This answers "which one would you
// take", which is a different and much more expensive question, so it is a
// different route: the club list is read by anything that needs a name and a
// colour, and this is read by the one screen where a manager is choosing.
//
// It reads the template world -- the starting league every save is cloned from
// -- because it is asked before any save exists. One query per fact, over 3,066
// players and 448 picks, aggregated in Postgres rather than in TypeScript: the
// alternative is thirty-two round trips or one enormous row set, and both are
// a second of waiting on the screen that is meant to feel like a decision.
//
// Every measure is nullable and every null means the same thing: the rows
// behind it are not there. The screen says so rather than printing a zero,
// because a club with no cap sheet and a club with no cap space are opposite
// facts.

import type { Handler } from '../context.ts';
import {
  quarterbackStatus, shapeLeague, type TeamMeasure, type TeamTag,
} from './teamShape.ts';
import type { Db } from '../db.ts';

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
  readonly capSpace: number | null;
  readonly draftCapital: number | null;
  readonly averageAge: number | null;
  readonly quarterbackStatus: string | null;
  readonly ownerPatience: number | null;
  readonly stadiumCapacity: number | null;
  /** Nothing in the world models a crowd yet, so this is null on every club
   *  rather than a number derived from market size wearing a different name. */
  readonly fanPressure: number | null;
  readonly archetype: string | null;
  readonly difficulty: string | null;
  readonly tags: readonly TeamTag[];
}

export interface TeamProfilesOut {
  readonly teams: readonly TeamProfile[];
}

/** Offence, defence and the kicking game, by the position groups the seed
 *  uses. A group that moves belongs here and nowhere else. */
const OFFENCE = ['Quarterback', 'Backfield', 'Receiver', 'O-Line'];
const DEFENCE = ['Front Seven', 'Secondary'];
const SPECIAL = ['Specialist'];

/** How many of a unit are actually on the field, and therefore how many the
 *  unit's rating is the mean of. Averaging all ninety would rate a club by the
 *  depth of its practice squad. */
const ON_FIELD = { offence: 11, defence: 11, special: 3 } as const;

/** What a pick in each round is worth, as a share of a first-rounder. Roughly
 *  geometric, which is how draft charts have always behaved: the gap between
 *  round one and two is worth more than rounds four through seven together. */
const ROUND_VALUE = [100, 60, 36, 22, 13, 8, 5];

interface ProfileRow {
  team_id: string; metro_area: string; nickname: string;
  conference_id: string; conference_name: string;
  division_id: string; division_name: string;
  primary_color: string; secondary_color: string;
  offense: string | null; defense: string | null; special_teams: string | null;
  average_age: string | null; quarterback: number | null;
  cap_space: string | null; draft_capital: string | null;
  owner_patience: number | null; stadium_capacity: number | null;
}

/** postgres.js hands back numerics and bigints as text so no digit is lost on
 *  the way. Nothing downstream may see the string. */
const num = (v: string | null): number | null => (v === null ? null : Number(v));

/** "AC North" under conference AC is "North". A division whose name does not
 *  start with its conference is returned whole rather than cut at a guess. */
function shortDivision(name: string, conferenceId: string): string {
  const prefix = `${conferenceId} `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

async function profileRows(db: Db, saveId: string, season: number): Promise<ProfileRow[]> {
  return db<ProfileRow[]>`
    with roster as (
      select team_id, position_group, overall_rating, age,
             row_number() over (
               partition by team_id,
                 case when position_group = any(${OFFENCE}) then 'O'
                      when position_group = any(${DEFENCE}) then 'D'
                      when position_group = any(${SPECIAL}) then 'S' end
               order by overall_rating desc) as depth,
             case when position_group = any(${OFFENCE}) then 'O'
                  when position_group = any(${DEFENCE}) then 'D'
                  when position_group = any(${SPECIAL}) then 'S' end as side
        from public.players
       where save_id = ${saveId} and team_id is not null and retired_season is null
    ),
    units as (
      select team_id,
             avg(overall_rating) filter (
               where side = 'O' and depth <= ${ON_FIELD.offence}) as offense,
             avg(overall_rating) filter (
               where side = 'D' and depth <= ${ON_FIELD.defence}) as defense,
             avg(overall_rating) filter (
               where side = 'S' and depth <= ${ON_FIELD.special}) as special_teams,
             avg(age) as average_age
        from roster group by team_id
    ),
    starters as (
      select team_id, max(overall_rating) as quarterback
        from public.players
       where save_id = ${saveId} and team_id is not null
         and retired_season is null and position = 'QB'
       group by team_id
    ),
    capital as (
      -- Picks the club owns now, whoever originally held them, so a trade in
      -- the seed shows up as the asset it is.
      select current_owner_team_id as team_id,
             sum((${ROUND_VALUE}::int[])[round]) as draft_capital
        from public.draft_picks
       where save_id = ${saveId} and selected_player_id is null
       group by current_owner_team_id
    )
    select t.team_id, t.metro_area, t.nickname,
           t.conference_id, c.name as conference_name,
           t.division_id, d.name as division_name,
           t.primary_color, t.secondary_color,
           u.offense::text as offense, u.defense::text as defense,
           u.special_teams::text as special_teams, u.average_age::text as average_age,
           s.quarterback,
           cap.available::text as cap_space,
           cp.draft_capital::text as draft_capital,
           o.patience as owner_patience, st.capacity as stadium_capacity
      from public.teams t
      join public.league_conferences c
        on c.save_id = t.save_id and c.conference_id = t.conference_id
      join public.league_divisions d
        on d.save_id = t.save_id and d.division_id = t.division_id
      left join units u on u.team_id = t.team_id
      left join starters s on s.team_id = t.team_id
      left join capital cp on cp.team_id = t.team_id
      left join public.salary_cap cap
        on cap.save_id = t.save_id and cap.team_id = t.team_id and cap.season = ${season}
      left join public.owners o on o.save_id = t.save_id and o.team_id = t.team_id
      left join public.stadiums st on st.save_id = t.save_id and st.team_id = t.team_id
     where t.save_id = ${saveId}
     order by t.conference_id, t.division_id, t.metro_area`;
}

export const teamProfiles: Handler<Record<string, never>, TeamProfilesOut> = {
  auth: 'required',
  parse: () => ({}),
  run: async ({ sql }) => {
    const [template] = await sql<{ id: string; season: number }[]>`
      select id, season from public.saves where is_template`;
    if (template === undefined) throw new Error('No template world has been imported');

    const rows = await profileRows(sql, template.id, template.season);

    // Rounded once, here, so the screen and the label agree about what a club
    // is rated. Two roundings of the same number is how a 74 gets filtered as
    // a 73.
    const rounded = (v: string | null): number | null => {
      const n = num(v);
      return n === null ? null : Math.round(n * 10) / 10;
    };

    const measures: TeamMeasure[] = rows.map((r) => {
      const offense = rounded(r.offense);
      const defense = rounded(r.defense);
      const specialTeams = rounded(r.special_teams);
      return {
        teamId: r.team_id,
        offense, defense, specialTeams,
        // The kicking game is a tenth of a club, which is about what it is
        // worth and well short of what it feels like in December.
        overall: offense === null || defense === null
          ? null
          : Math.round(offense * 0.45 + defense * 0.45 + (specialTeams ?? defense) * 0.1),
        averageAge: rounded(r.average_age),
        capSpace: num(r.cap_space),
        draftCapital: num(r.draft_capital),
        quarterback: r.quarterback,
      };
    });

    const shapes = shapeLeague(measures);

    return {
      teams: rows.map((r, i) => {
        const m = measures[i] as TeamMeasure;
        const shape = shapes.get(r.team_id);
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
          capSpace: m.capSpace, draftCapital: m.draftCapital, averageAge: m.averageAge,
          quarterbackStatus: quarterbackStatus(m.quarterback),
          ownerPatience: r.owner_patience,
          stadiumCapacity: r.stadium_capacity,
          fanPressure: null,
          archetype: shape?.archetype ?? null,
          difficulty: shape?.difficulty ?? null,
          tags: shape?.tags ?? [],
        };
      }),
    };
  },
};
