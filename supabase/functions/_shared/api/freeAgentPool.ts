// The pool, and signing out of it.
//
// free_agents already existed and the offseason market already read it. What
// it had never been was *persistent*: the pool was written at rollover, drained
// during free agency, and then ignored until the next one. Nothing put a player
// into it during a season and nothing took one out.
//
// Both halves are here. A player enters when he is released with four accrued
// seasons, or when the wire clears him; he leaves when he signs, and for no
// other reason -- a free agent who is still a free agent in week 14 is still on
// the list, which is the request's "free agents should remain available".
//
// One decision worth naming: a player entering the pool mid-season is priced
// and described from the engine's own record of him, read out of the save
// document. The alternative was a share of his last contract, which is what
// cutPlayer used to do and is wrong in a way that compounds -- a club that
// overpaid a player once would find him cheap forever after, and a club that
// had him on a rookie deal would find him unaffordable.

import type { Db } from './db.ts';
import { notFound } from './context.ts';
import { capRules } from '../engine/offseason/frontOffice.ts';
import { marketValue } from '../engine/offseason/contracts.ts';
import type { CareerPlayer } from '../engine/offseason/types.ts';
import {
  expectedYearsFor, inSeasonAsk, roleFromTier,
  type DesiredRole, type MarketPlayer,
} from './inSeasonMarket.ts';

/* ------------------------------------------------------------ entering ----- */

/**
 * The engine's own record of a player, out of the save document.
 *
 * A lateral over the players array rather than a load of the whole state: the
 * document is one jsonb column and this wants one object out of it. Null for a
 * player the engine does not model -- a seeded long snapper, say -- and the
 * caller prices him from his contract instead and records that it did.
 */
export async function engineRecord(
  db: Db, saveId: string, playerId: string,
): Promise<CareerPlayer | null> {
  const [row] = await db<{ player: CareerPlayer }[]>`
    select p as player
      from public.save_documents d,
           lateral jsonb_array_elements(d.document -> 'players') as p
     where d.save_id = ${saveId} and p ->> 'id' = ${playerId}
     limit 1`;
  return row?.player ?? null;
}

export interface PoolEntry {
  readonly playerId: string;
  readonly previousTeamId: string | null;
  /** The week he became available. */
  readonly week: number;
  /** What to ask if the engine has no record of him. */
  readonly fallbackAsk: number;
}

/**
 * Puts a player into the pool, priced and described.
 *
 * Shared by the wire clearing an unclaimed player and by a release that never
 * needed waivers, so a free agent arrives the same way whichever door he came
 * through.
 */
export async function enterFreeAgency(
  db: Db, saveId: string, season: number, entry: PoolEntry,
): Promise<void> {
  const record = await engineRecord(db, saveId, entry.playerId);
  const rules = capRules(season);
  const [row] = await db<{ role_tier: string | null; overall_rating: number; age: number }[]>`
    select role_tier, overall_rating, age from public.players
     where save_id = ${saveId} and player_id = ${entry.playerId}`;
  if (row === undefined) throw notFound('player');

  const asking = record === null ? entry.fallbackAsk : marketValue(record, rules);
  const role = roleFromTier(row.role_tier, row.overall_rating);

  await db`
    insert into public.free_agents (
      save_id, player_id, display_name, position, age, experience_years,
      overall_rating, previous_team_id, market_asking_aav, expected_years,
      personality, fa_type, desired_role, available_from_week, data_class)
    select ${saveId}, p.player_id, p.display_name, p.position, p.age,
           p.experience_years, p.overall_rating, ${entry.previousTeamId},
           ${asking}, ${expectedYearsFor(row.age)},
           -- Null where the engine holds no record of him: what a player wants
           -- beyond money is something this game knows about its own players
           -- and does not know about a seeded one, and a pool row that guessed
           -- would be a guess every screen then repeated as a fact.
           ${record?.personality ?? null}, 'UNRESTRICTED', ${role},
           ${entry.week}, 'ENGINE'
      from public.players p
     where p.save_id = ${saveId} and p.player_id = ${entry.playerId}
    on conflict (save_id, player_id) do update
      set previous_team_id = excluded.previous_team_id,
          market_asking_aav = excluded.market_asking_aav,
          expected_years = excluded.expected_years,
          desired_role = excluded.desired_role,
          available_from_week = excluded.available_from_week`;
  await db`
    update public.players set team_id = null, role_tier = 'FREE_AGENT'
     where save_id = ${saveId} and player_id = ${entry.playerId}`;
}

/* -------------------------------------------------------------- reading ---- */

export interface PoolFilters {
  readonly position: string | null;
  readonly group: string | null;
  readonly maxAge: number | null;
  readonly minOverall: number | null;
  readonly minPotential: number | null;
  readonly minExperience: number | null;
  readonly maxExperience: number | null;
  readonly maxAsk: number | null;
  readonly previousTeamId: string | null;
  /** 'ANY' | 'HEALTHY' | 'INJURED'. */
  readonly health: string;
  readonly search: string | null;
  readonly sort: string;
  readonly limit: number;
}

export const POOL_SORTS = ['OVERALL', 'POTENTIAL', 'ASK', 'AGE', 'NAME'] as const;

export const DEFAULT_POOL_FILTERS: PoolFilters = {
  position: null, group: null, maxAge: null, minOverall: null, minPotential: null,
  minExperience: null, maxExperience: null, maxAsk: null, previousTeamId: null,
  health: 'ANY', search: null, sort: 'OVERALL', limit: 60,
};

export interface PoolPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly positionGroup: string;
  readonly age: number;
  readonly overall: number;
  readonly potential: number;
  readonly experienceYears: number;
  readonly askingAav: number;
  readonly expectedYears: number | null;
  readonly desiredRole: DesiredRole | null;
  readonly personality: string | null;
  readonly previousTeamId: string | null;
  readonly previousTeamName: string | null;
  readonly availableFromWeek: number | null;
  readonly injuredWeeksOut: number | null;
  /** How well he fits the club reading the pool, 0-100, or null when no
   *  scheme is on record for it. Never a number stood in for one. */
  readonly schemeFit: number | null;
  /** What he would cost this club this season, given the weeks left. */
  readonly inSeasonAsk: number;
}

interface PoolRow {
  player_id: string; display_name: string; position: string; position_group: string;
  age: number; overall_rating: number; potential_rating: number;
  experience_years: number; market_asking_aav: string | null;
  expected_years: number | null; desired_role: string | null; personality: string | null;
  previous_team_id: string | null; previous_team_name: string | null;
  available_from_week: number | null; weeks_out: number | null;
}

/**
 * The pool, filtered.
 *
 * Every filter the request names is here and each is applied in SQL rather
 * than after the fact, because the pool is not small and a screen that pages
 * through it has to page through the filtered list, not a filtered page.
 * Scheme fit is the one column that is not stored: it is computed per club
 * below, and is null when the club has no scheme on record.
 */
export async function readPool(
  db: Db, saveId: string, season: number, week: number, seasonWeeks: number,
  filters: PoolFilters,
): Promise<readonly PoolPlayer[]> {
  const rules = capRules(season);
  const rows = await db<PoolRow[]>`
    select f.player_id, f.display_name, f.position, p.position_group,
           f.age, p.overall_rating, p.potential_rating, f.experience_years,
           f.market_asking_aav::text as market_asking_aav, f.expected_years,
           f.desired_role, f.personality, f.previous_team_id,
           t.metro_area || ' ' || t.nickname as previous_team_name,
           f.available_from_week,
           (i.injured_week + i.weeks_out_estimate - ${week})::int as weeks_out
      from public.free_agents f
      join public.players p on p.save_id = f.save_id and p.player_id = f.player_id
      left join public.teams t
        on t.save_id = f.save_id and t.team_id = f.previous_team_id
      left join public.player_injuries i
        on i.save_id = f.save_id and i.player_id = f.player_id
       and i.injured_season = ${season}
       and i.injured_week + i.weeks_out_estimate - ${week} >= 1
     where f.save_id = ${saveId}
       -- Still a free agent: a player who signed elsewhere is off the list the
       -- moment he does, and a retired one never reappears on it.
       and p.team_id is null and p.retired_season is null
       and (${filters.position}::text is null or f.position = ${filters.position})
       and (${filters.group}::text is null or p.position_group = ${filters.group})
       and (${filters.maxAge}::int is null or f.age <= ${filters.maxAge})
       and (${filters.minOverall}::int is null or p.overall_rating >= ${filters.minOverall})
       and (${filters.minPotential}::int is null or p.potential_rating >= ${filters.minPotential})
       and (${filters.minExperience}::int is null or f.experience_years >= ${filters.minExperience})
       and (${filters.maxExperience}::int is null or f.experience_years <= ${filters.maxExperience})
       and (${filters.maxAsk}::bigint is null or f.market_asking_aav <= ${filters.maxAsk})
       and (${filters.previousTeamId}::text is null or f.previous_team_id = ${filters.previousTeamId})
       and (${filters.search}::text is null or f.display_name ilike ${'%' + (filters.search ?? '') + '%'})
       and (${filters.health} = 'ANY'
            or (${filters.health} = 'HEALTHY' and i.player_id is null)
            or (${filters.health} = 'INJURED' and i.player_id is not null))
     order by
       case when ${filters.sort} = 'OVERALL' then p.overall_rating end desc nulls last,
       case when ${filters.sort} = 'POTENTIAL' then p.potential_rating end desc nulls last,
       case when ${filters.sort} = 'ASK' then f.market_asking_aav end desc nulls last,
       case when ${filters.sort} = 'AGE' then f.age end asc nulls last,
       case when ${filters.sort} = 'NAME' then f.display_name end asc nulls last,
       p.overall_rating desc, f.player_id
     limit ${filters.limit}`;

  return rows.map((r): PoolPlayer => {
    const ask = Number(r.market_asking_aav ?? rules.veteranMinimum);
    return {
      playerId: r.player_id, name: r.display_name, position: r.position,
      positionGroup: r.position_group, age: r.age,
      overall: r.overall_rating, potential: r.potential_rating,
      experienceYears: r.experience_years,
      askingAav: ask,
      expectedYears: r.expected_years,
      desiredRole: isRole(r.desired_role) ? r.desired_role : null,
      personality: r.personality,
      previousTeamId: r.previous_team_id,
      previousTeamName: r.previous_team_name,
      availableFromWeek: r.available_from_week,
      injuredWeeksOut: r.weeks_out,
      schemeFit: null,
      inSeasonAsk: inSeasonAsk(
        { askingAav: ask } as MarketPlayer, week, seasonWeeks, rules.veteranMinimum),
    };
  });
}

const isRole = (v: string | null): v is DesiredRole =>
  v === 'STARTER' || v === 'ROTATION' || v === 'DEPTH';
