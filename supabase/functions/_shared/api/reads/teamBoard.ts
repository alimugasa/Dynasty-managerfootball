// The queries behind the scouting board.
//
// Split from the handler so that neither file is mostly the other: this one is
// SQL and the shapes it returns, teamProfiles.ts is what those rows mean.
//
// Two queries, not nine. One walks the rosters once and aggregates every club
// at the same time; the other rates each position group for every club, 224
// rows, which is what the "biggest weakness" line is read from. Anything that
// asked per club would be thirty-two round trips on the screen a manager is
// meant to browse.

import type { Db } from '../db.ts';

/** Offence, defence and the kicking game, by the position groups the seed
 *  uses. A group that moves belongs here and nowhere else. */
export const OFFENCE = ['Quarterback', 'Backfield', 'Receiver', 'O-Line'];
export const DEFENCE = ['Front Seven', 'Secondary'];
export const SPECIAL = ['Specialist'];

/** How many of a unit are actually on the field, and therefore how many the
 *  unit's rating is the mean of. Averaging all ninety would rate a club by the
 *  depth of its practice squad. */
export const ON_FIELD = { offence: 11, defence: 11, special: 3 } as const;

/** What a pick in each round is worth, as a share of a first-rounder. Roughly
 *  geometric, which is how draft charts have always behaved: the gap between
 *  round one and two is worth more than rounds four through seven together. */
export const ROUND_VALUE = [100, 60, 36, 22, 13, 8, 5];

/** Old enough to have been drafted, young enough that his best football is
 *  ahead of him. The line the "top young player" row is drawn at. */
export const YOUNG_AGE = 24;

/** How many of a group are read when rating the group on its own. Smaller
 *  than the unit counts above because a group is a position room, not a side
 *  of the ball: five linemen start, one quarterback plays. */
export const GROUP_STARTERS: Readonly<Record<string, number>> = {
  Quarterback: 1, Backfield: 2, Receiver: 4, 'O-Line': 5,
  'Front Seven': 4, Secondary: 4, Specialist: 3,
};

export interface ProfileRow {
  team_id: string; metro_area: string; nickname: string;
  conference_id: string; conference_name: string;
  conference_abbr: string; conference_short: string;
  division_id: string; division_name: string; region: string;
  primary_color: string; secondary_color: string;
  market_size: number | null;
  offense: string | null; defense: string | null; special_teams: string | null;
  average_age: string | null; roster_count: string | null;
  quarterback: number | null; quarterback_age: number | null;
  quarterback_backup: number | null;
  cap_space: string | null; draft_capital: string | null;
  owner_patience: number | null; stadium_capacity: number | null;
  best_name: string | null; best_position: string | null; best_overall: number | null;
  young_name: string | null; young_position: string | null;
  young_age: number | null; young_overall: number | null;
}

export interface GroupRow {
  team_id: string; position_group: string; rating: string | null;
}

export async function profileRows(
  db: Db, saveId: string, season: number,
): Promise<ProfileRow[]> {
  return db<ProfileRow[]>`
    with roster as (
      select team_id, position, position_group, overall_rating, potential_rating,
             display_name, age,
             case when position_group = any(${OFFENCE}) then 'O'
                  when position_group = any(${DEFENCE}) then 'D'
                  when position_group = any(${SPECIAL}) then 'S' end as side
        from public.players
       where save_id = ${saveId} and team_id is not null and retired_season is null
    ),
    depth as (
      select *, row_number() over (
               partition by team_id, side order by overall_rating desc) as rank_in_side
        from roster
    ),
    units as (
      select team_id,
             avg(overall_rating) filter (
               where side = 'O' and rank_in_side <= ${ON_FIELD.offence}) as offense,
             avg(overall_rating) filter (
               where side = 'D' and rank_in_side <= ${ON_FIELD.defence}) as defense,
             avg(overall_rating) filter (
               where side = 'S' and rank_in_side <= ${ON_FIELD.special}) as special_teams,
             avg(age) as average_age,
             count(*) as roster_count
        from depth group by team_id
    ),
    passers as (
      -- The starter, his age, and what is behind him. The gap between the two
      -- is what tells an open competition from a settled job.
      select team_id,
             max(overall_rating) filter (where qb_rank = 1) as quarterback,
             max(age) filter (where qb_rank = 1) as quarterback_age,
             max(overall_rating) filter (where qb_rank = 2) as quarterback_backup
        from (
          select team_id, overall_rating, age,
                 row_number() over (partition by team_id order by overall_rating desc) as qb_rank
            from roster where position = 'QB'
        ) ranked
       where qb_rank <= 2 group by team_id
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
           c.abbreviation as conference_abbr, c.short_name as conference_short,
           t.division_id, d.name as division_name, d.region,
           t.primary_color, t.secondary_color, t.market_size,
           u.offense::text as offense, u.defense::text as defense,
           u.special_teams::text as special_teams,
           u.average_age::text as average_age, u.roster_count::text as roster_count,
           p.quarterback, p.quarterback_age, p.quarterback_backup,
           cap.available::text as cap_space,
           cp.draft_capital::text as draft_capital,
           o.patience as owner_patience, st.capacity as stadium_capacity,
           best.display_name as best_name, best.position as best_position,
           best.overall_rating as best_overall,
           young.display_name as young_name, young.position as young_position,
           young.age as young_age, young.overall_rating as young_overall
      from public.teams t
      join public.league_conferences c
        on c.save_id = t.save_id and c.conference_id = t.conference_id
      join public.league_divisions d
        on d.save_id = t.save_id and d.division_id = t.division_id
      left join units u on u.team_id = t.team_id
      left join passers p on p.team_id = t.team_id
      left join capital cp on cp.team_id = t.team_id
      left join public.salary_cap cap
        on cap.save_id = t.save_id and cap.team_id = t.team_id and cap.season = ${season}
      left join public.owners o on o.save_id = t.save_id and o.team_id = t.team_id
      left join public.stadiums st on st.save_id = t.save_id and st.team_id = t.team_id
      left join lateral (
        select display_name, position, overall_rating from roster r
         where r.team_id = t.team_id order by overall_rating desc, display_name limit 1
      ) best on true
      left join lateral (
        -- Ranked on what he might become, then on what he is: the point of the
        -- row is the player the rebuild is waiting on, not today's best rookie.
        --
        -- The club's best player is excluded. On a young roster he is often
        -- also the best player under twenty-five, and a report that names the
        -- same man twice has spent a row saying nothing the row above did not.
        select display_name, position, age, overall_rating from roster r
         where r.team_id = t.team_id and r.age <= ${YOUNG_AGE}
           and (best.display_name is null or r.display_name <> best.display_name)
         order by potential_rating desc nulls last, overall_rating desc, display_name limit 1
      ) young on true
     where t.save_id = ${saveId}
     order by t.conference_id, t.division_id, t.metro_area`;
}

/** Every club's every position group, rated on the players who start in it.
 *
 *  The starter count differs by group -- one quarterback plays and five
 *  linemen do -- so the counts travel into the query as a two-column list
 *  rather than being flattened to a single depth that would rate a quarterback
 *  room by its third-stringer. */
export async function groupRows(db: Db, saveId: string): Promise<GroupRow[]> {
  const groups = Object.keys(GROUP_STARTERS);
  const starters = groups.map((g) => GROUP_STARTERS[g] ?? 1);
  return db<GroupRow[]>`
    with counts as (
      select unnest(${groups}::text[]) as position_group,
             unnest(${starters}::int[]) as starters
    ),
    ranked as (
      select team_id, position_group, overall_rating,
             row_number() over (
               partition by team_id, position_group order by overall_rating desc) as depth
        from public.players
       where save_id = ${saveId} and team_id is not null and retired_season is null
    )
    select r.team_id, r.position_group, avg(r.overall_rating)::text as rating
      from ranked r
      join counts c on c.position_group = r.position_group
     where r.depth <= c.starters
     group by r.team_id, r.position_group`;
}

/** What the league a new dynasty opens into actually is.
 *
 *  Counted rather than stated: thirty-two clubs and eighteen weeks are facts
 *  about the template world, and a screen that printed them as constants would
 *  be wrong the day a seed with thirty-four clubs ships. The only figure not
 *  counted here is the playoff field, which is a rule of the competition and
 *  lives in the engine beside the bracket that uses it.
 */
export interface LeagueShape {
  readonly teams: number;
  readonly conferences: number;
  readonly divisions: number;
  readonly regularSeasonWeeks: number | null;
  readonly draftPicks: number;
  readonly season: number;
}

export async function leagueShape(db: Db, saveId: string, season: number): Promise<LeagueShape> {
  const [row] = await db<{
    teams: string; conferences: string; divisions: string;
    weeks: number | null; picks: string;
  }[]>`
    select
      (select count(*) from public.teams where save_id = ${saveId})::text as teams,
      (select count(*) from public.league_conferences
        where save_id = ${saveId})::text as conferences,
      (select count(*) from public.league_divisions
        where save_id = ${saveId})::text as divisions,
      (select max(week)::int from public.season_schedule
        where save_id = ${saveId} and season = ${season}
          and competition = 'REGULAR') as weeks,
      (select count(*) from public.draft_picks
        where save_id = ${saveId} and selected_player_id is null)::text as picks`;
  return {
    teams: Number(row?.teams ?? 0),
    conferences: Number(row?.conferences ?? 0),
    divisions: Number(row?.divisions ?? 0),
    // Null rather than a guess: a template with no schedule is a broken import,
    // and the screen should say the season length is unknown rather than
    // promise eighteen weeks nobody wrote.
    regularSeasonWeeks: row?.weeks ?? null,
    draftPicks: Number(row?.picks ?? 0),
    season,
  };
}
