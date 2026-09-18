// The wire, against the database.
//
// waiverRules.ts decides who is ahead of whom and which claim wins; this puts
// players on the wire, records what clubs want, and carries out the decision.
// The split is deliberate: the ordering is a rule and is tested without a
// database, and everything here is bookkeeping that has to be right rather
// than clever.
//
// Two facts shape the whole module.
//
// A claim is settled by the priority in force when it was made. That is why
// waiver_claims stores priority_at_claim, and why nothing here looks the
// number up again at resolution.
//
// A window is settled once. Resolution runs at the start of a week for every
// window whose deadline has passed, inside the same transaction that plays it,
// and marks the row CLAIMED or CLEARED -- so a wire that is resolved twice
// does nothing the second time rather than awarding the same player twice.

import type { Db } from './db.ts';
import { badRequest, notFound } from './context.ts';
import { deadlineFor, waiverOrder, windowOpen, type ClubStanding } from './waiverRules.ts';

export interface WirePlayer {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly overall: number;
  readonly potential: number;
  readonly experienceYears: number;
  readonly fromTeamId: string | null;
  readonly postedWeek: number;
  readonly deadlineWeek: number;
  /** The deal a claiming club inherits, or null if he was released without one. */
  readonly inheritedAav: number | null;
  readonly inheritedYears: number | null;
  readonly injured: boolean;
  readonly claims: number;
  /** Whether the club reading this has a claim in. */
  readonly claimed: boolean;
}

/* ------------------------------------------------------------- priority ---- */

/**
 * Sets every club's waiver priority for the season, from wherever the order
 * can currently be read.
 *
 * Called when the season opens and again whenever the wire is resolved, so the
 * order tracks the table as it forms. It never moves a club that has just been
 * awarded a player back up the queue: reorderAfterAward writes the post-award
 * order, and this recompute is skipped in the same week for exactly that
 * reason -- see resolveWaivers.
 */
export async function refreshWaiverPriority(
  db: Db, saveId: string, season: number,
): Promise<readonly string[]> {
  const rows = await db<{
    team_id: string; wins: number; losses: number; ties: number; last_rank: number | null;
  }[]>`
    select t.team_id,
           coalesce(s.wins, 0) as wins, coalesce(s.losses, 0) as losses,
           coalesce(s.ties, 0) as ties,
           -- Where the club finished last season. Null in a league's first
           -- year, which waiverOrder treats as "no finish on record" rather
           -- than inventing a placing for it.
           (select rank() over (order by p.win_pct desc, p.points_for desc)
              from public.standings p
             where p.save_id = t.save_id and p.season = ${season - 1}
               and p.team_id = t.team_id)::int as last_rank
      from public.teams t
      left join public.standings s
        on s.save_id = t.save_id and s.season = ${season} and s.team_id = t.team_id
     where t.save_id = ${saveId}`;

  const order = waiverOrder(rows.map((r): ClubStanding => ({
    teamId: r.team_id, wins: r.wins, losses: r.losses, ties: r.ties,
    lastSeasonRank: r.last_rank,
  })));
  await writeWaiverOrder(db, saveId, order);
  return order;
}

/** Stores an order as the priority column, 1 first. */
export async function writeWaiverOrder(
  db: Db, saveId: string, order: readonly string[],
): Promise<void> {
  if (order.length === 0) return;
  await db`
    update public.teams t set waiver_priority = u.priority
      from unnest(${[...order]}::text[], ${order.map((_, i) => i + 1)}::int[])
        as u(team_id, priority)
     where t.save_id = ${saveId} and t.team_id = u.team_id`;
}

/** The order as it currently stands. Clubs with no priority yet sort last,
 *  which only happens before the first refresh. */
export async function currentWaiverOrder(db: Db, saveId: string): Promise<readonly string[]> {
  const rows = await db<{ team_id: string }[]>`
    select team_id from public.teams
     where save_id = ${saveId}
     order by waiver_priority nulls last, team_id`;
  return rows.map((r) => r.team_id);
}

export async function waiverPriorityOf(
  db: Db, saveId: string, teamId: string,
): Promise<number | null> {
  const [row] = await db<{ waiver_priority: number | null }[]>`
    select waiver_priority from public.teams
     where save_id = ${saveId} and team_id = ${teamId}`;
  return row?.waiver_priority ?? null;
}

/* ----------------------------------------------------------- posting -------- */

/**
 * Puts a released player on the wire.
 *
 * Called by cutPlayer for a player with fewer than four accrued seasons. The
 * window is the week he was posted plus WAIVER_WINDOW_WEEKS, and his contract
 * is left ACTIVE-but-terminated by the caller: what a claiming club inherits
 * is read off the terminated row at resolution, because a claim takes the
 * deal as it stood, not a new one.
 */
export async function postToWaivers(
  db: Db, saveId: string, season: number, week: number,
  playerId: string, fromTeamId: string,
): Promise<{ readonly deadlineWeek: number }> {
  const deadlineWeek = deadlineFor(week);
  await db`
    insert into public.waiver_wire (
      save_id, player_id, season, from_team_id, posted_week, deadline_week, state)
    values (${saveId}, ${playerId}, ${season}, ${fromTeamId}, ${week}, ${deadlineWeek}, 'OPEN')
    on conflict (save_id, player_id, season, posted_week) do update
      set from_team_id = excluded.from_team_id,
          deadline_week = excluded.deadline_week,
          state = 'OPEN', awarded_team_id = null, resolved_week = null`;
  return { deadlineWeek };
}

/* ------------------------------------------------------------ claiming ------ */

interface OpenRow {
  player_id: string; posted_week: number; deadline_week: number;
  from_team_id: string | null;
}

/** The open window for this player, or a refusal saying why there is none. */
async function openWindow(
  db: Db, saveId: string, season: number, week: number, playerId: string,
): Promise<OpenRow> {
  const [row] = await db<OpenRow[]>`
    select player_id, posted_week, deadline_week, from_team_id
      from public.waiver_wire
     where save_id = ${saveId} and season = ${season} and player_id = ${playerId}
       and state = 'OPEN'
     order by posted_week desc
     limit 1`;
  if (row === undefined) throw notFound('player on waivers');
  if (!windowOpen(row.deadline_week, week)) {
    throw badRequest('The claim window for this player has closed');
  }
  return row;
}

export interface ClaimResult {
  readonly playerId: string;
  readonly deadlineWeek: number;
  readonly priority: number;
  readonly claims: number;
}

/**
 * Records a club's claim.
 *
 * The priority is stamped here and never read again, which is the rule the
 * whole system turns on: a club that claimed on Tuesday from third is settled
 * from third, whatever the queue looks like by the time the window shuts.
 */
export async function submitClaim(
  db: Db, saveId: string, season: number, week: number,
  teamId: string, playerId: string,
): Promise<ClaimResult> {
  const window = await openWindow(db, saveId, season, week, playerId);
  if (window.from_team_id === teamId) {
    throw badRequest('A club cannot claim a player it has just released');
  }
  const priority = await waiverPriorityOf(db, saveId, teamId);
  if (priority === null) {
    throw badRequest('This club has no waiver priority set for the season');
  }
  await db`
    insert into public.waiver_claims (
      save_id, player_id, season, posted_week, team_id, priority_at_claim, outcome)
    values (${saveId}, ${playerId}, ${season}, ${window.posted_week}, ${teamId}, ${priority}, null)
    on conflict (save_id, player_id, season, posted_week, team_id) do update
      set priority_at_claim = excluded.priority_at_claim,
          submitted_at = now(), outcome = null`;
  const claims = await claimCount(db, saveId, season, playerId, window.posted_week);
  return { playerId, deadlineWeek: window.deadline_week, priority, claims };
}

/** Withdraws a claim. Only possible while the window is open, which is the
 *  point of it: after that the claim has already been settled. */
export async function cancelClaim(
  db: Db, saveId: string, season: number, week: number,
  teamId: string, playerId: string,
): Promise<{ readonly playerId: string }> {
  const window = await openWindow(db, saveId, season, week, playerId);
  const removed = await db`
    delete from public.waiver_claims
     where save_id = ${saveId} and season = ${season} and player_id = ${playerId}
       and posted_week = ${window.posted_week} and team_id = ${teamId}
       and outcome is null
    returning team_id`;
  if (removed.length === 0) throw notFound('claim to cancel');
  return { playerId };
}

async function claimCount(
  db: Db, saveId: string, season: number, playerId: string, postedWeek: number,
): Promise<number> {
  const [row] = await db<{ n: string }[]>`
    select count(*)::text as n from public.waiver_claims
     where save_id = ${saveId} and season = ${season} and player_id = ${playerId}
       and posted_week = ${postedWeek}`;
  return Number(row?.n ?? 0);
}
