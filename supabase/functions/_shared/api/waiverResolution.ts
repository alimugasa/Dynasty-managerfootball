// Settling a claim window.
//
// Split from waivers.ts, which posts players and records what clubs want:
// this is the half that carries out the decision, and it is the half with the
// side effects. A resolution moves a player, a contract and a cap sheet, and
// that is enough work to be worth reading on its own.
//
// It runs at the top of a week, inside the week's transaction, for every
// window whose deadline has passed. A window is settled once: the row is
// marked CLAIMED or CLEARED as part of the same transaction, so a wire that is
// resolved twice does nothing the second time rather than awarding the same
// player to two clubs.

import type { Db } from './db.ts';
import type { SaveRow } from './save.ts';
import { awardClaim, reorderAfterAward } from './waiverRules.ts';
import { capRules } from '../engine/offseason/frontOffice.ts';
import { ACTIVE_ROSTER_LIMIT, refreshCapSheet, teamCapSpace, teamRosterCount } from './rosterSpace.ts';
import { enterFreeAgency } from './freeAgentPool.ts';
import { applyDocumentMove } from './engineRoster.ts';
import { currentWaiverOrder, writeWaiverOrder } from './waivers.ts';
import {
  clubNames, logMove, missedClaimStory, money, type MoveContext,
} from './transactionLog.ts';
import type { NewsRow } from './franchiseNews.ts';

export interface WaiverAward {
  readonly playerId: string;
  readonly playerName: string;
  readonly position: string;
  readonly fromTeamId: string | null;
  readonly awardedTeamId: string | null;
  /** Clubs whose claim was considered and could not be honoured, in queue
   *  order, plus every club behind the winner. Both need telling. */
  readonly lostBy: readonly string[];
  readonly aav: number;
  readonly years: number;
  /** Why an eligible-looking claim was passed over, for the notice. */
  readonly refusals: ReadonlyMap<string, string>;
}

interface PendingRow {
  player_id: string; posted_week: number; deadline_week: number;
  from_team_id: string | null; display_name: string; position: string;
}

/**
 * Settles every window whose deadline has passed.
 *
 * Runs at the top of a week inside the week transaction. A player nobody
 * eligible claimed goes into the free-agent pool -- which is the request's
 * "unclaimed players become free agents", and the reason the wire is not
 * simply a delay before the market.
 */
export async function resolveWaivers(
  db: Db, save: SaveRow, week: number,
): Promise<readonly WaiverAward[]> {
  const pending = await db<PendingRow[]>`
    select w.player_id, w.posted_week, w.deadline_week, w.from_team_id,
           p.display_name, p.position
      from public.waiver_wire w
      join public.players p on p.save_id = w.save_id and p.player_id = w.player_id
     where w.save_id = ${save.id} and w.season = ${save.season} and w.state = 'OPEN'
       and w.deadline_week <= ${week}
     order by w.posted_week, w.player_id`;
  if (pending.length === 0) return [];

  const rules = capRules(save.season);
  let order = await currentWaiverOrder(db, save.id);
  const awards: WaiverAward[] = [];

  for (const row of pending) {
    const claims = await db<{ team_id: string; priority_at_claim: number }[]>`
      select team_id, priority_at_claim from public.waiver_claims
       where save_id = ${save.id} and season = ${save.season}
         and player_id = ${row.player_id} and posted_week = ${row.posted_week}
         and outcome is null`;

    // What a claiming club takes on. Read off the terminated contract rather
    // than priced fresh: a claim inherits the deal, which is the whole reason
    // a club might not want one.
    const [deal] = await db<{ aav: string | null; years: number | null }[]>`
      select average_annual_value::text as aav, years_remaining as years
        from public.player_contracts
       where save_id = ${save.id} and player_id = ${row.player_id}
       order by case when contract_status = 'ACTIVE' then 0 else 1 end, end_year desc
       limit 1`;
    const aav = Number(deal?.aav ?? rules.veteranMinimum);
    const years = Math.max(1, deal?.years ?? 1);

    // Eligibility is checked at resolution, not at claim time: a club that had
    // room on Tuesday and filled it on Thursday cannot take him, and must not
    // block the clubs behind it either.
    const refusals = new Map<string, string>();
    const eligible = new Map<string, boolean>();
    for (const claim of claims) {
      const roster = await teamRosterCount(db, save.id, claim.team_id);
      const space = await teamCapSpace(db, save.id, save.season, claim.team_id);
      if (roster >= ACTIVE_ROSTER_LIMIT) {
        refusals.set(claim.team_id, 'No roster place');
        eligible.set(claim.team_id, false);
      } else if (space < aav) {
        refusals.set(claim.team_id, 'Not enough cap room');
        eligible.set(claim.team_id, false);
      } else {
        eligible.set(claim.team_id, true);
      }
    }

    const decision = awardClaim(
      claims.map((c) => ({ teamId: c.team_id, priorityAtClaim: c.priority_at_claim })),
      (teamId) => ({
        eligible: eligible.get(teamId) ?? false,
        reason: refusals.get(teamId) ?? null,
      }));

    const lostBy = claims
      .map((c) => c.team_id)
      .filter((id) => id !== decision.winner);

    if (decision.winner !== null) {
      await awardPlayer(db, save, row, decision.winner, aav, years);
      order = reorderAfterAward(order, decision.winner);
      await writeWaiverOrder(db, save.id, order);
    } else {
      await clearToFreeAgency(db, save, row, week, aav);
    }

    await db`
      update public.waiver_claims
         set outcome = case when team_id = ${decision.winner} then 'WON' else 'LOST' end
       where save_id = ${save.id} and season = ${save.season}
         and player_id = ${row.player_id} and posted_week = ${row.posted_week}
         and outcome is null`;
    await db`
      update public.waiver_wire
         set state = ${decision.winner === null ? 'CLEARED' : 'CLAIMED'},
             awarded_team_id = ${decision.winner}, resolved_week = ${week}
       where save_id = ${save.id} and season = ${save.season}
         and player_id = ${row.player_id} and posted_week = ${row.posted_week}`;

    awards.push({
      playerId: row.player_id, playerName: row.display_name, position: row.position,
      fromTeamId: row.from_team_id, awardedTeamId: decision.winner,
      lostBy, aav, years, refusals,
    });
  }
  return awards;
}

/** Puts a claimed player on his new club, with the deal he came with. */
async function awardPlayer(
  db: Db, save: SaveRow, row: PendingRow, teamId: string, aav: number, years: number,
): Promise<void> {
  // position and roster_status are both not-null, and acquisition_type says
  // how he got here -- which is the column the history would otherwise have
  // to infer from a transaction row somewhere else.
  await db`
    insert into public.team_rosters (
      save_id, team_id, player_id, position, roster_status,
      acquisition_type, acquisition_year)
    values (${save.id}, ${teamId}, ${row.player_id}, ${row.position}, 'ACTIVE',
            'WAIVER_CLAIM', ${save.season})
    on conflict (save_id, player_id) do update
      set team_id = excluded.team_id, position = excluded.position,
          roster_status = 'ACTIVE', acquisition_type = excluded.acquisition_type,
          acquisition_year = excluded.acquisition_year`;
  await db`
    update public.players set team_id = ${teamId}
     where save_id = ${save.id} and player_id = ${row.player_id}`;
  // The inherited contract, reinstated against the new club. A claim takes the
  // deal over, so the row is moved rather than replaced -- a replacement would
  // quietly reset the years and make a claim better than it is.
  const reinstated = await db`
    update public.player_contracts
       set team_id = ${teamId}, contract_status = 'ACTIVE'
     where save_id = ${save.id} and player_id = ${row.player_id}
       and contract_status = 'TERMINATED'
    returning contract_id`;
  if (reinstated.length === 0) {
    await db`
      insert into public.player_contracts (
        save_id, contract_id, player_id, team_id, start_year, end_year,
        years_total, years_remaining, total_value, average_annual_value,
        guaranteed_money, contract_status, data_class)
      values (${save.id}, ${`${row.player_id}-claim-${String(save.season)}`}, ${row.player_id},
              ${teamId}, ${save.season}, ${save.season + years - 1}, ${years}, ${years},
              ${aav * years}, ${aav}, 0, 'ACTIVE', 'ENGINE')
      on conflict do nothing`;
  }
  // Out of the market if he somehow reached it, and off the wire's pool.
  await db`
    delete from public.free_agents
     where save_id = ${save.id} and player_id = ${row.player_id}`;
  // The deal he came with is now on this club's books.
  await refreshCapSheet(db, save.id, save.season, teamId);
  // And he is on this club's roster in the engine's own state, which is the
  // copy that picks the eleven. Without this a claimed player sat on a roster
  // he never played for.
  await applyDocumentMove(db, save.id, {
    playerId: row.player_id, teamId,
    contract: {
      aav, years, yearsRemaining: years,
      guaranteed: Math.round(aav * years * 0.45), signedSeason: save.season,
    },
  });
}

/** Nobody eligible claimed him, so the market gets him. */
async function clearToFreeAgency(
  db: Db, save: SaveRow, row: PendingRow, week: number, aav: number,
): Promise<void> {
  await enterFreeAgency(db, save.id, save.season, {
    playerId: row.player_id, previousTeamId: row.from_team_id,
    week, fallbackAsk: aav,
  });
}

/**
 * What a settled window is worth telling somebody.
 *
 * Two kinds of notice. A claim that succeeded is a transaction and is logged
 * as one, with the story the log decides on. A claim that failed is only ever
 * the claiming club's business -- nobody reports that a club did not get a
 * player -- so it goes to the managed club alone, and only when it was the
 * managed club that lost.
 *
 * The distinction between losing on priority and being passed over for want of
 * room is carried through, because they are different mistakes: one is bad
 * luck and the other is a roster the manager could have made space on.
 */
export async function waiverStories(
  db: Db, save: SaveRow, awards: readonly WaiverAward[],
): Promise<readonly NewsRow[]> {
  if (awards.length === 0) return [];
  const ctx: MoveContext = {
    saveId: save.id, season: save.season, week: save.week, phase: save.phase,
    userTeamId: save.user_team_id, clubNames: await clubNames(db, save.id),
  };
  const stories: NewsRow[] = [];

  for (const award of awards) {
    const [player] = await db<{ overall_rating: number }[]>`
      select overall_rating from public.players
       where save_id = ${save.id} and player_id = ${award.playerId}`;
    const overall = player?.overall_rating ?? 0;

    if (award.awardedTeamId !== null) {
      await logMove(db, ctx, {
        kind: 'WAIVER_CLAIM', teamId: award.awardedTeamId,
        playerId: award.playerId, playerName: award.playerName,
        position: award.position, overall, capImpact: award.aav,
        fromTeamId: award.fromTeamId,
        detail: `Inherits ${String(award.years)} year${award.years === 1 ? '' : 's'} `
          + `at ${money(award.aav)} a year`,
      });
    }

    // The notice the request asks for: the club that claimed and did not get
    // him is told, and told why.
    if (award.lostBy.includes(save.user_team_id)) {
      stories.push(missedClaimStory(
        ctx, save.user_team_id, award.playerName, award.position, award.playerId,
        award.awardedTeamId, award.refusals.get(save.user_team_id) ?? null));
    }
  }
  return stories;
}
