// League -> player_contracts, contract_years, salary_cap.
//
// The engine's deal is flat: one average annual value for every remaining
// year, a guaranteed total, no bonuses. The rows say exactly that. Where the
// schema has a column for a concept the engine does not model -- a signing
// bonus, a contract type -- the value is NULL. contract_years.guaranteed stays
// NULL by decision: its derivation rule has not been set, and the one reader
// (mappers.ts) refuses to assume one.

import type { Db } from '../db.ts';
import {
  capRules, capSheet, deadMoneyIfCut, type CareerPlayer, type League,
} from '../../engine/offseason/index.ts';
import { ENGINE_DATA_CLASS, MODELLED_POSITIONS } from './players.ts';

export const contractIdFor = (p: CareerPlayer, signedSeason: number): string =>
  `${p.id}-${String(signedSeason)}`;

interface YearRow {
  contract_id: string; season: number; base_salary: number; cap_hit: number;
  dead_cap_if_cut: number;
}

export async function projectContracts(db: Db, saveId: string, league: League): Promise<void> {
  const signed = league.players.filter(
    (p) => !p.retired && p.teamId !== null && p.contract !== null && p.contract.yearsRemaining > 0);

  // Only the engine's players' deals are rewritten; a long snapper's seed
  // contract stays as the seed wrote it.
  await db`
    delete from public.player_contracts c using public.players p
     where c.save_id = ${saveId} and p.save_id = c.save_id and p.player_id = c.player_id
       and p.position = any(${[...MODELLED_POSITIONS]}::text[])`;

  const years: YearRow[] = [];
  for (const p of signed) {
    const c = p.contract;
    if (c === null) continue;
    const endYear = c.signedSeason + c.years;
    const firstRemaining = endYear - c.yearsRemaining + 1;
    for (let season = firstRemaining; season <= endYear; season += 1) {
      // Dead money if cut in that year: the engine's own rule, evaluated with
      // the years that would have been served by then.
      const then: CareerPlayer = { ...p, contract: { ...c, yearsRemaining: endYear - season + 1 } };
      years.push({
        contract_id: contractIdFor(p, c.signedSeason), season,
        base_salary: c.aav, cap_hit: c.aav, dead_cap_if_cut: deadMoneyIfCut(then),
      });
    }
  }

  if (signed.length > 0) {
    await db`
      insert into public.player_contracts (
        save_id, contract_id, player_id, team_id, contract_type, start_year, end_year,
        years_total, years_remaining, total_value, average_annual_value,
        signing_bonus_total, guaranteed_money, contract_status, data_class)
      select ${saveId}, u.contract_id, u.player_id, u.team_id, null, u.start_year,
             u.end_year, u.years_total, u.years_remaining, u.total_value, u.aav,
             null, u.guaranteed, 'ACTIVE', ${ENGINE_DATA_CLASS}
        from unnest(
          ${signed.map((p) => contractIdFor(p, p.contract?.signedSeason ?? 0))}::text[],
          ${signed.map((p) => p.id)}::text[],
          ${signed.map((p) => p.teamId)}::text[],
          ${signed.map((p) => (p.contract?.signedSeason ?? 0) + 1)}::int[],
          ${signed.map((p) => (p.contract?.signedSeason ?? 0) + (p.contract?.years ?? 0))}::int[],
          ${signed.map((p) => p.contract?.years ?? 0)}::int[],
          ${signed.map((p) => p.contract?.yearsRemaining ?? 0)}::int[],
          ${signed.map((p) => (p.contract?.aav ?? 0) * (p.contract?.years ?? 0))}::bigint[],
          ${signed.map((p) => p.contract?.aav ?? 0)}::bigint[],
          ${signed.map((p) => p.contract?.guaranteed ?? 0)}::bigint[]
        ) as u(contract_id, player_id, team_id, start_year, end_year, years_total,
               years_remaining, total_value, aav, guaranteed)`;
  }
  if (years.length > 0) {
    await db`
      insert into public.contract_years (
        save_id, contract_id, season, base_salary, signing_bonus_proration,
        roster_bonus, cap_hit, dead_cap_if_cut, guaranteed)
      select ${saveId}, u.contract_id, u.season, u.base_salary, 0, 0, u.cap_hit,
             u.dead_cap_if_cut, null
        from unnest(
          ${years.map((y) => y.contract_id)}::text[],
          ${years.map((y) => y.season)}::int[],
          ${years.map((y) => y.base_salary)}::bigint[],
          ${years.map((y) => y.cap_hit)}::bigint[],
          ${years.map((y) => y.dead_cap_if_cut)}::bigint[]
        ) as u(contract_id, season, base_salary, cap_hit, dead_cap_if_cut)`;
  }

  await projectSalaryCap(db, saveId, league);
}

/** The cap sheet per club for the league's current season. Rollover is 0
 *  because the engine has no rollover: that is the model, not a default. */
export async function projectSalaryCap(db: Db, saveId: string, league: League): Promise<void> {
  const rules = capRules(league.season);
  const sheets = league.teamIds.map((teamId) => capSheet(
    teamId,
    league.players.filter((p) => !p.retired && p.teamId === teamId),
    rules,
    league.deadMoney.get(teamId) ?? 0,
  ));
  await db`
    insert into public.salary_cap (
      save_id, team_id, season, cap_limit, committed, dead_money, available,
      contracts_counted, rollover_from_prior, data_class)
    select ${saveId}, u.team_id, ${league.season}, u.cap_limit, u.committed, u.dead_money,
           u.available, u.contracts, 0, ${ENGINE_DATA_CLASS}
      from unnest(
        ${sheets.map((s) => s.teamId)}::text[],
        ${sheets.map((s) => s.capLimit)}::bigint[],
        ${sheets.map((s) => s.committed)}::bigint[],
        ${sheets.map((s) => s.deadMoney)}::bigint[],
        ${sheets.map((s) => s.available)}::bigint[],
        ${sheets.map((s) => s.contracts)}::int[]
      ) as u(team_id, cap_limit, committed, dead_money, available, contracts)
    on conflict (save_id, team_id, season) do update
      set cap_limit = excluded.cap_limit, committed = excluded.committed,
          dead_money = excluded.dead_money, available = excluded.available,
          contracts_counted = excluded.contracts_counted,
          rollover_from_prior = excluded.rollover_from_prior,
          data_class = excluded.data_class`;
}
