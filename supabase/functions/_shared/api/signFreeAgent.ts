// Putting an offer to a free agent, and signing him if he takes it.
//
// Split from freeAgentPool.ts, which owns who is in the pool and how it is
// read: this owns what happens when somebody is taken out of it. The two were
// one module and the module was long, but the seam is real -- reading the pool
// changes nothing, and everything here changes four tables.
//
// The order of operations is the point. Roster room and cap room are checked
// before the player is asked, because a player who accepts an offer his new
// club cannot register has been asked a question nobody had the right to ask,
// and the manager would then have to be told no twice for one decision.

import type { Db } from './db.ts';
import { badRequest, notFound } from './context.ts';
import type { SaveRow } from './save.ts';
import { capRules } from '../engine/offseason/frontOffice.ts';
import {
  ACCEPT_THRESHOLD, answerOffer, desiredLength, expectedYearsFor, inSeasonAsk,
  roleFromTier, signingProbability,
  type ClubOffer, type DesiredRole, type MarketPlayer, type OfferVerdict,
} from './inSeasonMarket.ts';
import { ACTIVE_ROSTER_LIMIT, refreshCapSheet, teamCapSpace, teamRosterCount } from './rosterSpace.ts';

const isRole = (v: string | null): v is DesiredRole =>
  v === 'STARTER' || v === 'ROTATION' || v === 'DEPTH';

export interface SignTerms {
  readonly playerId: string;
  readonly aav: number;
  readonly years: number;
  readonly role: DesiredRole;
}

export interface SignQuote {
  readonly player: MarketPlayer;
  readonly ask: number;
  readonly probability: number;
  readonly capHit: number;
  readonly capSpaceAfter: number;
  readonly rosterAfter: number;
  readonly rosterSpace: boolean;
}

/** Everything the offer sheet shows before a manager commits to it. */
export async function quoteSigning(
  db: Db, save: SaveRow, teamId: string, terms: SignTerms,
  week: number, seasonWeeks: number, contention: number, need: number,
): Promise<SignQuote> {
  const player = await marketPlayer(db, save.id, save.season, terms.playerId);
  const rules = capRules(save.season);
  const ask = inSeasonAsk(player, week, seasonWeeks, rules.veteranMinimum);
  const capSpace = await teamCapSpace(db, save.id, save.season, teamId);
  const roster = await teamRosterCount(db, save.id, teamId);
  const offer: ClubOffer = {
    teamId, aav: terms.aav, years: terms.years, role: terms.role,
    need, contention, capSpace,
  };
  return {
    player, ask,
    probability: signingProbability(player, offer, ask),
    capHit: terms.aav,
    capSpaceAfter: capSpace - terms.aav,
    rosterAfter: roster + 1,
    rosterSpace: roster < ACTIVE_ROSTER_LIMIT,
  };
}

/** The pool row as the market model wants it. */
export async function marketPlayer(
  db: Db, saveId: string, season: number, playerId: string,
): Promise<MarketPlayer> {
  const [row] = await db<{
    player_id: string; display_name: string; position: string; age: number;
    overall_rating: number; potential_rating: number; experience_years: number;
    market_asking_aav: string | null; expected_years: number | null;
    desired_role: string | null; personality: string | null;
    previous_team_id: string | null; role_tier: string | null;
  }[]>`
    select f.player_id, f.display_name, f.position, f.age,
           p.overall_rating, p.potential_rating, f.experience_years,
           f.market_asking_aav::text as market_asking_aav, f.expected_years,
           f.desired_role, f.personality, f.previous_team_id, p.role_tier
      from public.free_agents f
      join public.players p on p.save_id = f.save_id and p.player_id = f.player_id
     where f.save_id = ${saveId} and f.player_id = ${playerId}
       and p.team_id is null and p.retired_season is null`;
  if (row === undefined) throw notFound('free agent');
  const rules = capRules(season);
  return {
    playerId: row.player_id, name: row.display_name, position: row.position,
    age: row.age, overall: row.overall_rating, potential: row.potential_rating,
    experienceYears: row.experience_years,
    askingAav: Number(row.market_asking_aav ?? rules.veteranMinimum),
    expectedYears: row.expected_years ?? expectedYearsFor(row.age),
    desiredRole: isRole(row.desired_role)
      ? row.desired_role
      : roleFromTier(row.role_tier, row.overall_rating),
    // A player the engine holds no personality for weighs an offer the way the
    // median free agent does. Stated here, once, rather than written into his
    // row as though it were known about him.
    personality: isPersonality(row.personality) ? row.personality : 'MAX_MONEY',
    previousTeamId: row.previous_team_id,
  };
}

const PERSONALITIES = new Set([
  'MAX_MONEY', 'CHAMPIONSHIP', 'LOYALTY', 'ROLE',
  'LOCATION', 'COACH_RELATIONSHIP', 'LONG_TERM_SECURITY',
]);
const isPersonality = (v: string | null): v is MarketPlayer['personality'] =>
  v !== null && PERSONALITIES.has(v);

export interface SigningOutcome {
  readonly verdict: OfferVerdict;
  readonly playerId: string;
  readonly playerName: string;
  readonly position: string;
  readonly aav: number;
  readonly years: number;
  readonly probability: number;
}

/**
 * Puts an offer to a free agent, and signs him if he takes it.
 *
 * Roster and cap are checked before he is asked, not after he accepts: a
 * player who says yes to a club that cannot sign him has been asked a question
 * nobody had the right to ask, and the manager would have to be told no twice.
 */
export async function offerToFreeAgent(
  db: Db, save: SaveRow, teamId: string, terms: SignTerms,
  week: number, seasonWeeks: number, contention: number, need: number,
): Promise<SigningOutcome> {
  const roster = await teamRosterCount(db, save.id, teamId);
  if (roster >= ACTIVE_ROSTER_LIMIT) {
    throw badRequest(`The roster is full at ${String(ACTIVE_ROSTER_LIMIT)}; release a player first`);
  }
  const player = await marketPlayer(db, save.id, save.season, terms.playerId);
  const rules = capRules(save.season);
  const ask = inSeasonAsk(player, week, seasonWeeks, rules.veteranMinimum);
  const capSpace = await teamCapSpace(db, save.id, save.season, teamId);
  const offer: ClubOffer = {
    teamId, aav: terms.aav, years: terms.years, role: terms.role,
    need, contention, capSpace,
  };
  const verdict = answerOffer(player, offer, ask);
  const probability = signingProbability(player, offer, ask);

  if (verdict.kind === 'ACCEPTED') {
    await signPlayer(db, save, teamId, player, terms.aav, terms.years);
  }
  return {
    verdict, playerId: player.playerId, playerName: player.name,
    position: player.position, aav: terms.aav, years: terms.years, probability,
  };
}

/**
 * The move itself: roster, contract, pool, cap.
 *
 * Exported because a computer-run club signs the same way a managed one does.
 * Two signing paths would be two chances for one of them to forget the cap
 * sheet, and the one that forgot would be the one nobody was looking at.
 */
export async function signPlayer(
  db: Db, save: SaveRow, teamId: string,
  player: MarketPlayer, aav: number, years: number,
): Promise<void> {
  await db`
    insert into public.team_rosters (
      save_id, team_id, player_id, position, roster_status,
      acquisition_type, acquisition_year)
    values (${save.id}, ${teamId}, ${player.playerId}, ${player.position}, 'ACTIVE',
            'FREE_AGENCY', ${save.season})
    on conflict (save_id, player_id) do update
      set team_id = excluded.team_id, position = excluded.position,
          roster_status = 'ACTIVE', acquisition_type = excluded.acquisition_type,
          acquisition_year = excluded.acquisition_year`;
  await db`
    update public.players set team_id = ${teamId}, role_tier = ${player.desiredRole === 'STARTER'
      ? 'STARTER' : player.desiredRole === 'ROTATION' ? 'ROTATIONAL' : 'DEPTH'}
     where save_id = ${save.id} and player_id = ${player.playerId}`;
  await db`
    insert into public.player_contracts (
      save_id, contract_id, player_id, team_id, start_year, end_year,
      years_total, years_remaining, total_value, average_annual_value,
      guaranteed_money, contract_status, data_class)
    values (${save.id}, ${`${player.playerId}-fa-${String(save.season)}-${String(save.week)}`},
            ${player.playerId}, ${teamId}, ${save.season}, ${save.season + years - 1},
            ${years}, ${years}, ${aav * years}, ${aav},
            ${Math.round(aav * years * 0.45)}, 'ACTIVE', 'ENGINE')
    on conflict (save_id, contract_id) do update
      set team_id = excluded.team_id, average_annual_value = excluded.average_annual_value,
          years_total = excluded.years_total, years_remaining = excluded.years_remaining,
          total_value = excluded.total_value, contract_status = 'ACTIVE'`;
  await db`
    delete from public.free_agents
     where save_id = ${save.id} and player_id = ${player.playerId}`;
  await refreshCapSheet(db, save.id, save.season, teamId);
}

/** What the offer panel shows as the shape of a deal he would take. */
export function suggestedTerms(player: MarketPlayer, ask: number): SignTerms {
  return {
    playerId: player.playerId,
    aav: ask,
    years: desiredLength(player),
    role: player.desiredRole,
  };
}

export { ACCEPT_THRESHOLD };
