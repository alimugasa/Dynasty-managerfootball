// The database's side of a valuation.
//
// tradeValue.ts prices an asset and knows nothing about where the numbers come
// from; this fetches them. The split is the same one the rest of this codebase
// keeps: the judgement is pure and tested without a database, and the SQL is
// dull and tested against one.
//
// One thing here is worth stating. A player's trade value depends on the club
// *receiving* him -- scheme fit and positional need are properties of the
// buyer, not of the player -- so an asset is priced per side, twice, and the
// two numbers legitimately differ. A single neutral price would make every
// club agree about every deal, and then no deal would be interesting.

import type { Db } from './db.ts';
import { notFound } from './context.ts';
import { capRules } from '../engine/offseason/frontOffice.ts';
import { GROUP_OF } from '../engine/careerWorld.ts';
import { POSITION_GROUPS, type PositionGroup } from '../engine/types.ts';
import type { CareerPlayer } from '../engine/offseason/types.ts';
import {
  NO_FACTORS, pickTradeValue, playerTradeValue, positionScarcity, schemeFitFor,
  type TradeFactors,
} from './tradeValue.ts';
import type { ValuedAsset } from './tradeStrategy.ts';

/** What a person calls each group, so a reason reads as football. */
export const GROUP_LABEL: Readonly<Record<PositionGroup, string>> = {
  QB: 'quarterback', RB: 'running back', WR: 'receiver', TE: 'tight end',
  OL: 'the offensive line', EDGE: 'edge rusher', DT: 'defensive tackle',
  LB: 'linebacker', CB: 'cornerback', S: 'safety',
  K: 'kicker', P: 'punter', LS: 'long snapper',
};

export interface AssetRef {
  readonly kind: 'PLAYER' | 'PICK';
  readonly id: string;
}

interface PlayerRow {
  player_id: string; display_name: string; position: string; team_id: string | null;
  age: number; experience_years: number; overall_rating: number;
  potential_rating: number; draft_round: number | null; morale: number | null;
  aav: string | null; years_remaining: number | null; guaranteed: string | null;
  years_total: number | null; signed_season: number | null;
  games_missed_career: number | null; games_missed_season: number | null;
  production: number | null;
}

/**
 * Prices every asset in a package, from one club's point of view.
 *
 * `forTeamId` is the club doing the acquiring, and it is what makes scheme fit
 * and need mean anything. Passing the wrong one produces numbers that are not
 * wrong so much as answers to a different question, which is why both callers
 * name it explicitly rather than defaulting.
 */
export async function valueAssets(
  db: Db, saveId: string, season: number,
  refs: readonly AssetRef[], forTeamId: string,
): Promise<readonly ValuedAsset[]> {
  if (refs.length === 0) return [];
  const rules = capRules(season);
  const scheme = await schemeOf(db, saveId, forTeamId);
  const scarcity = await leagueScarcity(db, saveId);
  const out: ValuedAsset[] = [];

  const playerIds = refs.filter((r) => r.kind === 'PLAYER').map((r) => r.id);
  const pickIds = refs.filter((r) => r.kind === 'PICK').map((r) => r.id);

  if (playerIds.length > 0) {
    const rows = await db<PlayerRow[]>`
      select p.player_id, p.display_name, p.position, p.team_id, p.age,
             p.experience_years, p.overall_rating, p.potential_rating,
             p.draft_round, p.morale,
             c.average_annual_value::text as aav, c.years_remaining,
             c.guaranteed_money::text as guaranteed, c.years_total,
             c.start_year as signed_season,
             -- Games missed, counted from the injury rows rather than assumed.
             (select coalesce(sum(i.weeks_out_estimate), 0)::int
                from public.player_injuries i
               where i.save_id = p.save_id and i.player_id = p.player_id
             ) as games_missed_career,
             (select coalesce(sum(i.weeks_out_estimate), 0)::int
                from public.player_injuries i
               where i.save_id = p.save_id and i.player_id = p.player_id
                 and i.injured_season = ${season}
             ) as games_missed_season,
             -- Production this season, as a 0-100 read. Null before he has
             -- played: a rating is what is known about a man in week 1.
             (select case when s.games_played > 0
                       then least(100, greatest(0, round(
                         (coalesce(s.pass_yards, 0) / 22.0
                          + coalesce(s.rush_yards, 0) / 5.5
                          + coalesce(s.rec_yards, 0) / 5.0
                          + coalesce(s.tackles, 0) * 1.4
                          + coalesce(s.sacks, 0) * 9
                          + coalesce(s.ints_caught, 0) * 12)
                         / greatest(s.games_played, 1) * 1.6)))::int
                     end
                from public.player_season_stats s
               where s.save_id = p.save_id and s.player_id = p.player_id
                 and s.season = ${season} and s.competition = 'REGULAR'
             ) as production
        from public.players p
        left join public.player_contracts c
          on c.save_id = p.save_id and c.player_id = p.player_id
         and c.contract_status = 'ACTIVE'
       where p.save_id = ${saveId} and p.player_id = any(${playerIds}::text[])`;

    const byId = new Map(rows.map((r) => [r.player_id, r]));
    for (const id of playerIds) {
      const row = byId.get(id);
      if (row === undefined) throw notFound(`player ${id}`);
      const group: PositionGroup = GROUP_OF[row.position] ?? 'LS';
      const career = asCareerPlayer(row, group, season);
      const factors: TradeFactors = {
        ...NO_FACTORS,
        gamesMissedCareer: row.games_missed_career,
        gamesMissedSeason: row.games_missed_season,
        production: row.production,
        scarcity: scarcity.get(group) ?? null,
        schemeFit: schemeFitFor(group, scheme),
        morale: row.morale,
        draftRound: row.draft_round,
        yearsRemaining: Math.max(0, (row.years_remaining ?? 1) - 1),
      };
      out.push({
        kind: 'PLAYER', id, label: `${row.position} ${row.display_name}`,
        value: playerTradeValue(career, rules, factors),
        age: row.age, overall: row.overall_rating,
        group, groupLabel: GROUP_LABEL[group],
        salary: Number(row.aav ?? 0),
      });
    }
  }

  if (pickIds.length > 0) {
    const rows = await db<{
      pick_id: string; draft_year: number; round: number; slot: number | null;
      owner: string; original: string;
    }[]>`
      select d.pick_id, d.draft_year, d.round,
             -- Where in the round it is expected to fall: the original club's
             -- place in reverse order of standing. Null where no games have
             -- been played in the season that sets it, which is every future
             -- year -- and the valuation says so rather than inventing a slot.
             (select rank() over (order by s.win_pct, s.points_for)
                from public.standings s
               where s.save_id = d.save_id and s.season = ${season}
                 and s.team_id = d.original_team_id)::int as slot,
             d.current_owner_team_id as owner, d.original_team_id as original
        from public.draft_picks d
       where d.save_id = ${saveId} and d.pick_id = any(${pickIds}::text[])`;
    const [clubs] = await db<{ n: string }[]>`
      select count(*)::text as n from public.teams where save_id = ${saveId}`;
    const picksPerRound = Number(clubs?.n ?? 32);
    const played = await gamesPlayed(db, saveId, season);

    const byId = new Map(rows.map((r) => [r.pick_id, r]));
    for (const id of pickIds) {
      const row = byId.get(id);
      if (row === undefined) throw notFound(`pick ${id}`);
      const yearsAway = Math.max(0, row.draft_year - season);
      // A slot is only meaningful for the draft this season decides. A future
      // year has no standings behind it and is priced at the middle of its
      // round, which is the honest answer to "where will this land".
      const slot = yearsAway === 0 && played ? row.slot : null;
      out.push({
        kind: 'PICK', id,
        label: `${String(row.draft_year)} round ${String(row.round)}`,
        value: pickTradeValue({ round: row.round, slot, picksPerRound, yearsAway }),
        age: null, overall: null, group: null, groupLabel: null, salary: 0,
      });
    }
  }
  return out;
}

/** The engine's shape of a player, from the rows. Ratings stand in for the
 *  document's finer attributes, which no relational table carries. */
function asCareerPlayer(row: PlayerRow, group: PositionGroup, season: number): CareerPlayer {
  return {
    id: row.player_id, name: row.display_name, group, teamId: row.team_id,
    age: row.age, experience: row.experience_years,
    ability: row.overall_rating, potential: row.potential_rating,
    mental: 0.5, devRate: 1, workEthic: 70, durability: 70, footballIq: 70,
    reputation: row.overall_rating,
    // The relational tables carry no honours history for a player, so this
    // reports none rather than claiming a clean sheet -- the valuation does
    // not read it, and a screen that did would be reading this comment.
    accolades: { allLeague: 0, awards: 0, rings: 0 },
    retired: false, retiredInSeason: null,
    gamesMissedCareer: row.games_missed_career ?? 0,
    gamesMissedSeason: row.games_missed_season ?? 0,
    personality: 'MAX_MONEY', previousTeamId: null,
    contract: row.aav === null ? null : {
      aav: Number(row.aav), years: row.years_total ?? 1,
      yearsRemaining: row.years_remaining ?? 1,
      guaranteed: Number(row.guaranteed ?? 0),
      signedSeason: row.signed_season ?? season,
    },
  };
}

/** A club's play-calling tendencies, or null where none are on record. */
async function schemeOf(
  db: Db, saveId: string, teamId: string,
): Promise<{ runPassBalance: number; blitzRate: number } | null> {
  const [row] = await db<{ run_pass: string | null; blitz: string | null }[]>`
    select run_pass_balance::text as run_pass, blitz_rate::text as blitz
      from public.team_schemes
     where save_id = ${saveId} and team_id = ${teamId}`;
  if (row === undefined || row.run_pass === null || row.blitz === null) return null;
  return { runPassBalance: Number(row.run_pass), blitzRate: Number(row.blitz) };
}

/** How short the league is of each position, counted across every club. */
export async function leagueScarcity(
  db: Db, saveId: string,
): Promise<ReadonlyMap<PositionGroup, number>> {
  const rows = await db<{ position: string; team_id: string; best: number }[]>`
    select p.position, r.team_id, max(p.overall_rating) as best
      from public.team_rosters r
      join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
     where r.save_id = ${saveId}
     group by p.position, r.team_id`;
  const byGroup = new Map<PositionGroup, number[]>();
  for (const row of rows) {
    const group = GROUP_OF[row.position];
    if (group === undefined) continue;
    const list = byGroup.get(group) ?? [];
    list.push(row.best);
    byGroup.set(group, list);
  }
  const out = new Map<PositionGroup, number>();
  for (const group of POSITION_GROUPS) {
    const scarce = positionScarcity(byGroup.get(group) ?? []);
    if (scarce !== null) out.set(group, scarce);
  }
  return out;
}

/** Whether this season has produced a table worth reading a pick order off. */
async function gamesPlayed(db: Db, saveId: string, season: number): Promise<boolean> {
  const [row] = await db<{ n: string }[]>`
    select count(*)::text as n from public.game_results
     where save_id = ${saveId} and season = ${season} and competition = 'REGULAR'`;
  return Number(row?.n ?? 0) > 0;
}
