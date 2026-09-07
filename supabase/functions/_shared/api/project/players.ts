// League -> players, team_rosters, free_agents.
//
// The document is the engine's truth; these tables are what the client reads.
// The projection runs one way, document to rows, after anything that changes
// a roster, so the two cannot disagree for longer than one transaction.
//
// What a column holds is what the engine holds. A rating is rounded because
// the column is an integer; a value the engine does not model (a jersey number
// for a draftee, a signing bonus) is NULL, not a plausible number.

import type { Db } from '../db.ts';
import { GROUP_OF } from '../../engine/careerWorld.ts';
import { capRules, marketValue, type League, type CareerPlayer } from '../../engine/offseason/index.ts';

/** Provenance marker on rows the engine wrote, beside the seed's GENERATED
 *  and MODELED. */
export const ENGINE_DATA_CLASS = 'ENGINE';

export interface PlayerProjectionContext {
  /** Players in the previous document, so a player who left the league this
   *  offseason (retired, or unsigned long enough to be pruned) loses his club
   *  on the row rather than keeping a team he is not on. */
  readonly previousIds?: ReadonlySet<string>;
  /** Draft position for players who entered by the draft, keyed by player id. */
  readonly drafted?: ReadonlyMap<string, { round: number; overall: number; year: number }>;
  readonly retired?: readonly CareerPlayer[];
}

export interface PlayerRow {
  readonly player_id: string;
  readonly position: string;
  readonly position_group: string;
}

/** The position column per player, which the engine does not carry. */
export async function positionsFor(db: Db, saveId: string): Promise<Map<string, PlayerRow>> {
  const rows = await db<PlayerRow[]>`
    select player_id, position, position_group from public.players where save_id = ${saveId}`;
  return new Map(rows.map((r) => [r.player_id, r]));
}

/** The seed's label for each engine group ('OL' -> 'O-Line'), read off the rows
 *  it already holds rather than typed here a second time. */
function groupLabels(rows: ReadonlyMap<string, PlayerRow>): Map<string, string> {
  const labels = new Map<string, string>();
  for (const row of rows.values()) {
    const group = GROUP_OF[row.position];
    if (group !== undefined && !labels.has(group)) labels.set(group, row.position_group);
  }
  return labels;
}

export async function projectPlayers(
  db: Db, saveId: string, league: League, ctx: PlayerProjectionContext = {},
): Promise<void> {
  const existing = await positionsFor(db, saveId);
  const labels = groupLabels(existing);
  const known = league.players.filter((p) => existing.has(p.id));
  const fresh = league.players.filter((p) => !existing.has(p.id));

  if (known.length > 0) {
    await db`
      update public.players p
         set team_id = u.team_id,
             -- A jersey number belongs to a club. The engine does not assign
             -- them, so a player who changed clubs has none until something does.
             jersey_number = case when u.team_id is distinct from p.team_id then null
                                  else p.jersey_number end,
             overall_rating = u.overall,
             potential_rating = u.potential,
             age = u.age,
             experience_years = u.experience,
             retired_season = u.retired_season
        from unnest(
          ${known.map((p) => p.id)}::text[],
          ${known.map((p) => p.teamId)}::text[],
          ${known.map((p) => Math.round(p.ability))}::int[],
          ${known.map((p) => Math.round(p.potential))}::int[],
          ${known.map((p) => Math.round(p.age))}::int[],
          ${known.map((p) => Math.round(p.experience))}::int[],
          ${known.map((p) => p.retiredInSeason)}::int[]
        ) as u(player_id, team_id, overall, potential, age, experience, retired_season)
       where p.save_id = ${saveId} and p.player_id = u.player_id`;
  }

  for (const p of fresh) {
    const pick = ctx.drafted?.get(p.id);
    const label = labels.get(p.group);
    if (label === undefined) {
      throw new Error(`No position label on file for group ${p.group}; cannot insert ${p.id}`);
    }
    await db`
      insert into public.players (
        save_id, player_id, display_name, team_id, position, position_group, age,
        experience_years, draft_year, draft_round, draft_overall_pick, draft_status,
        rookie_flag, overall_rating, potential_rating, retired_season, data_class)
      values (
        ${saveId}, ${p.id}, ${p.name}, ${p.teamId}, ${p.group}, ${label}, ${Math.round(p.age)},
        ${Math.round(p.experience)}, ${pick?.year ?? null}, ${pick?.round ?? null},
        ${pick?.overall ?? null}, ${pick === undefined ? 'UNDRAFTED' : 'DRAFTED'},
        true, ${Math.round(p.ability)}, ${Math.round(p.potential)}, ${p.retiredInSeason},
        ${ENGINE_DATA_CLASS})`;
    await db`
      insert into public.player_attributes (
        save_id, player_id, position, durability, work_ethic, football_iq, data_class)
      values (${saveId}, ${p.id}, ${p.group}, ${Math.round(p.durability)},
              ${Math.round(p.workEthic)}, ${Math.round(p.footballIq)}, ${ENGINE_DATA_CLASS})`;
  }

  // Gone from the league: no club. Retired players also record the season.
  if (ctx.previousIds !== undefined) {
    const inLeague = new Set(league.players.map((p) => p.id));
    const departed = [...ctx.previousIds].filter((id) => !inLeague.has(id));
    if (departed.length > 0) {
      await db`
        update public.players set team_id = null
         where save_id = ${saveId} and player_id = any(${departed}::text[])`;
    }
  }
  const retired = ctx.retired ?? [];
  if (retired.length > 0) {
    await db`
      update public.players p set team_id = null, retired_season = u.season
        from unnest(${retired.map((p) => p.id)}::text[],
                    ${retired.map((p) => p.retiredInSeason)}::int[]) as u(player_id, season)
       where p.save_id = ${saveId} and p.player_id = u.player_id`;
  }

  await projectRosters(db, saveId, league);
}

async function projectRosters(db: Db, saveId: string, league: League): Promise<void> {
  const rules = capRules(league.season);
  const rostered = league.players.filter((p) => !p.retired && p.teamId !== null);
  const free = league.players.filter((p) => !p.retired && p.teamId === null);

  await db`delete from public.team_rosters where save_id = ${saveId}`;
  await db`
    insert into public.team_rosters (
      save_id, player_id, team_id, position, jersey_number, roster_status,
      active_status, data_class)
    select ${saveId}, u.player_id, u.team_id, p.position, p.jersey_number, 'ACTIVE',
           true, ${ENGINE_DATA_CLASS}
      from unnest(${rostered.map((p) => p.id)}::text[],
                  ${rostered.map((p) => p.teamId)}::text[]) as u(player_id, team_id)
      join public.players p on p.save_id = ${saveId} and p.player_id = u.player_id`;

  await db`delete from public.free_agents where save_id = ${saveId}`;
  await db`
    insert into public.free_agents (
      save_id, player_id, display_name, position, age, experience_years,
      overall_rating, previous_team_id, market_asking_aav, personality, data_class)
    select ${saveId}, u.player_id, p.display_name, p.position, u.age, u.experience,
           u.overall, u.previous_team_id, u.asking, u.personality, ${ENGINE_DATA_CLASS}
      from unnest(${free.map((p) => p.id)}::text[],
                  ${free.map((p) => Math.round(p.age))}::int[],
                  ${free.map((p) => Math.round(p.experience))}::int[],
                  ${free.map((p) => Math.round(p.ability))}::int[],
                  ${free.map((p) => p.previousTeamId)}::text[],
                  ${free.map((p) => marketValue(p, rules))}::bigint[],
                  ${free.map((p) => p.personality)}::text[])
        as u(player_id, age, experience, overall, previous_team_id, asking, personality)
      join public.players p on p.save_id = ${saveId} and p.player_id = u.player_id`;
}
