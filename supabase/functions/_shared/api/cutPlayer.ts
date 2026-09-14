// Releasing a player, and telling the truth about it first.
//
// A cut is the one move in camp that cannot be taken back, so the handler is
// built in two halves that share one calculation: `cutTerms` works out what
// releasing this man would do and writes nothing, and `cutPlayer` does it. The
// confirmation the manager reads and the transaction the database records come
// from the same function, which is the only way a modal saying "saves $4.2M,
// $1.1M dead" can be trusted.
//
// Waiver eligibility is the rule every league in this sport uses and the one
// most managers half-remember: under four accrued seasons and a released
// player is subject to waivers, so another club may claim him and his contract
// with him. Four or more and he is a free agent the moment he is let go, free
// to sign anywhere. It matters in camp more than anywhere else, because the
// player a club hoped to sneak onto its practice squad is exactly the player
// somebody else claims.

import type { Db } from './db.ts';
import { badRequest, notFound } from './context.ts';
import type { SaveRow } from './save.ts';
import { MAX_DEAD_MONEY_SHARE } from '../engine/offseason/contracts.ts';

/** Accrued seasons below which a released player passes through waivers. */
export const WAIVER_THRESHOLD_YEARS = 4;

export interface CutTerms {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly teamId: string;
  /** What he is charged against the cap this season. */
  readonly capHit: number;
  /** What stays on the books after he has gone. */
  readonly deadMoney: number;
  /** capHit less deadMoney. Can be zero on a heavily guaranteed deal, and
   *  occasionally that is the whole story. */
  readonly capSavings: number;
  readonly waivers: boolean;
  readonly experienceYears: number;
  /** The roster before and after, so a modal can say both. */
  readonly rosterBefore: number;
  readonly rosterAfter: number;
}

interface Row {
  player_id: string; display_name: string; position: string; team_id: string;
  experience_years: number;
  aav: string | null; guaranteed: string | null;
  years_total: number | null; years_remaining: number | null;
}

/**
 * What releasing this player would cost and save.
 *
 * The dead-money arithmetic is the engine's own (contracts.ts), restated here
 * against the projected contract rows rather than the save document, because
 * this runs on the rows a manager is looking at. The ceiling is the engine's
 * constant, imported rather than repeated: a club whose expensive deals are
 * all guaranteed needs some legal route back under the cap, and that ceiling
 * is it.
 */
export async function cutTerms(
  db: Db, saveId: string, teamId: string, playerId: string,
): Promise<CutTerms> {
  const [row] = await db<Row[]>`
    select r.player_id, p.display_name, p.position, r.team_id, p.experience_years,
           c.average_annual_value::text as aav, c.guaranteed_money::text as guaranteed,
           c.years_total, c.years_remaining
      from public.team_rosters r
      join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
      left join public.player_contracts c
        on c.save_id = r.save_id and c.player_id = r.player_id
       and c.contract_status = 'ACTIVE'
     where r.save_id = ${saveId} and r.team_id = ${teamId} and r.player_id = ${playerId}`;
  if (row === undefined) throw notFound('player on this roster');

  const [count] = await db<{ n: string }[]>`
    select count(*)::text as n from public.team_rosters
     where save_id = ${saveId} and team_id = ${teamId}`;
  const rosterBefore = Number(count?.n ?? 0);

  const capHit = Number(row.aav ?? 0);
  const guaranteed = Number(row.guaranteed ?? 0);
  const total = row.years_total ?? 0;
  const remaining = row.years_remaining ?? 0;
  const served = total - remaining;
  const remainingShare = total > 0 ? Math.max(0, Math.min(1, 1 - served / total)) : 0;
  const deadMoney = Math.round(Math.min(guaranteed * remainingShare, capHit * MAX_DEAD_MONEY_SHARE));

  return {
    playerId: row.player_id,
    name: row.display_name,
    position: row.position,
    teamId: row.team_id,
    capHit,
    deadMoney,
    capSavings: Math.max(0, capHit - deadMoney),
    waivers: row.experience_years < WAIVER_THRESHOLD_YEARS,
    experienceYears: row.experience_years,
    rosterBefore,
    rosterAfter: Math.max(0, rosterBefore - 1),
  };
}

/**
 * Releases him.
 *
 * Returns the same terms the confirmation showed, recomputed rather than
 * passed in: a client that sent back a stale figure must not be able to make
 * the transaction record say something the cap sheet does not.
 */
export async function cutPlayer(
  db: Db, save: SaveRow, playerId: string,
): Promise<CutTerms> {
  const terms = await cutTerms(db, save.id, save.user_team_id, playerId);

  // Off the roster and off the depth chart. A released player left on a chart
  // is a player the week runner will try to field.
  await db`
    delete from public.team_rosters
     where save_id = ${save.id} and team_id = ${save.user_team_id} and player_id = ${playerId}`;
  await db`
    delete from public.team_depth_charts
     where save_id = ${save.id} and team_id = ${save.user_team_id} and player_id = ${playerId}`;
  await db`
    update public.player_contracts set contract_status = 'TERMINATED'
     where save_id = ${save.id} and player_id = ${playerId} and contract_status = 'ACTIVE'`;
  // The player himself is now unattached. players.team_id is what every other
  // read joins on, so leaving it would put him on two rosters at once.
  await db`
    update public.players set team_id = null
     where save_id = ${save.id} and player_id = ${playerId}`;

  // Where he goes. A waived player is on waivers rather than in the market,
  // and the distinction is recorded even though no club claims him yet --
  // the free_agents row is what the market reads, so a player on waivers is
  // deliberately not in it.
  if (!terms.waivers) {
    await db`
      insert into public.free_agents (
        save_id, player_id, display_name, position, age, experience_years,
        overall_rating, previous_team_id, market_asking_aav)
      select ${save.id}, p.player_id, p.display_name, p.position, p.age,
             p.experience_years, p.overall_rating, ${save.user_team_id},
             ${Math.round(terms.capHit * 0.6)}
        from public.players p
       where p.save_id = ${save.id} and p.player_id = ${playerId}
      on conflict do nothing`;
  }

  await db`
    insert into public.transactions (
      save_id, season, week, phase, kind, team_id, player_id, player_name,
      detail, cap_impact)
    values (${save.id}, ${save.season}, ${save.week}, ${save.phase},
            'RELEASE', ${save.user_team_id},
            ${playerId}, ${terms.name},
            ${terms.waivers ? 'Released and subject to waivers' : 'Released; free agent'},
            ${terms.deadMoney})`;

  // The evaluation goes with him. A cut player on the camp board is a player
  // the manager already dealt with, and leaving him there would make the
  // bubble list wrong for the rest of August.
  await db`
    delete from public.camp_evaluations
     where save_id = ${save.id} and season = ${save.season} and player_id = ${playerId}`;

  return terms;
}

/** Guards a cut against the phases where it is not a camp decision. */
export function requireCuttable(save: SaveRow): void {
  const allowed = ['TRAINING_CAMP', 'PRESEASON', 'FINAL_CUTS', 'REGULAR_SEASON'];
  if (!allowed.includes(save.phase)) {
    throw badRequest('Players cannot be released in this phase');
  }
}
