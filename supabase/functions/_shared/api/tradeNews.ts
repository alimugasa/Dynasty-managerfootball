// What the league says about a trade.
//
// Two kinds of story. A completed deal is reported when it involves the club
// being managed or a player good enough that it would be reported anywhere --
// the same test every other transaction story uses, for the same reason: a
// feed carrying all thirty-two clubs' depth swaps buries the football.
//
// The other kind is a rumour, which is not a report of anything. A club that
// has listed a good player is a story before any deal exists, and it is the
// story that makes a deadline feel like one -- the week before is supposed to
// be full of noise.

import type { Db } from './db.ts';
import type { SaveRow } from './save.ts';
import type { NewsRow } from './franchiseNews.ts';
import { clubNames } from './transactionLog.ts';
import type { ExecutedTrade } from './tradeExecute.ts';
import { deadlineNotice, tradeWindow } from './tradeWindow.ts';
import { seasonWeeks } from './save.ts';

/** How good a player has to be for a trade involving him to be league news. */
export const NOTABLE_TRADE = 76;

/**
 * The story a completed trade produces.
 *
 * One story for the deal rather than one per player, because a three-for-two
 * is one event and a feed that reported it five times would be a feed nobody
 * finishes reading. The headline names both clubs; the body says who went
 * which way.
 */
export async function tradeStory(
  db: Db, save: SaveRow, done: ExecutedTrade, origin: 'USER' | 'CPU',
): Promise<readonly NewsRow[]> {
  const [a, b] = done.teams;
  const names = await clubNames(db, save.id);
  const mine = a === save.user_team_id || b === save.user_team_id;

  const best = await db<{ overall_rating: number }[]>`
    select max(p.overall_rating) as overall_rating
      from public.trade_assets t
      join public.players p on p.save_id = t.save_id and p.player_id = t.player_id
     where t.save_id = ${save.id} and t.trade_id = ${done.tradeId}`;
  const headline = Number(best[0]?.overall_rating ?? 0);
  if (!mine && headline < NOTABLE_TRADE) return [];

  const side = (team: string): string => {
    const got = done.received.get(team) ?? [];
    return got.length === 0
      ? 'draft capital'
      : got.join(', ');
  };
  const nameOf = (team: string): string => names.get(team) ?? team;

  return [{
    season: save.season, week: save.week, phase: save.phase,
    category: 'TRANSACTION',
    // Filed against the managed club where it is theirs, so the Team chip
    // finds it; against the acquiring club otherwise.
    teamId: mine ? save.user_team_id : a,
    playerId: null, gameId: null,
    importance: mine ? 4 : 3,
    headline: `${nameOf(a)} and ${nameOf(b)} swing a trade`,
    body: `${nameOf(a)} receive ${side(a)}. ${nameOf(b)} receive ${side(b)}.`
      + (origin === 'CPU' ? '' : ''),
  }];
}

/**
 * The noise before the deadline.
 *
 * Written from the trade block, which is the only thing in this game that
 * genuinely constitutes a rumour: a club has told the league a player is
 * available, and that is news whether or not anybody trades for him.
 */
export async function rumourStories(
  db: Db, save: SaveRow,
): Promise<readonly NewsRow[]> {
  const weeks = await seasonWeeks(db, save.id, save.season);
  const w = tradeWindow(save.phase, save.week, weeks, save.trade_deadline_week);
  // Only once the deadline is close enough to be the reason for the noise.
  if (!w.open || w.weeksLeft > 3) return [];

  const rows = await db<{
    player_id: string; display_name: string; position: string;
    overall_rating: number; team_id: string;
  }[]>`
    select b.player_id, p.display_name, p.position, p.overall_rating, b.team_id
      from public.trade_block b
      join public.players p on p.save_id = b.save_id and p.player_id = b.player_id
     where b.save_id = ${save.id} and p.overall_rating >= ${NOTABLE_TRADE}
     order by p.overall_rating desc
     limit 3`;
  if (rows.length === 0) return [];
  const names = await clubNames(db, save.id);
  const notice = deadlineNotice(w) ?? 'The deadline is close';

  return rows.map((row): NewsRow => ({
    season: save.season, week: save.week, phase: save.phase,
    category: 'TRANSACTION',
    teamId: row.team_id, playerId: row.player_id, gameId: null,
    importance: row.team_id === save.user_team_id ? 4 : 3,
    headline: `${row.position} ${row.display_name} available before the deadline`,
    body: `${names.get(row.team_id) ?? row.team_id} are listening on `
      + `${row.position} ${row.display_name}. ${notice}.`,
  }));
}

/**
 * The day after.
 *
 * A deadline with no account of what happened at it is a rule rather than an
 * event. This is the one story that reports the league rather than a club, and
 * it is written once, in the week the window shuts.
 */
export async function deadlineRecap(
  db: Db, save: SaveRow,
): Promise<readonly NewsRow[]> {
  const weeks = await seasonWeeks(db, save.id, save.season);
  const w = tradeWindow(save.phase, save.week, weeks, save.trade_deadline_week);
  if (!w.isDeadlineWeek) return [];

  const [count] = await db<{ n: string; players: string }[]>`
    select count(distinct t.trade_id)::text as n,
           count(*) filter (where a.kind = 'PLAYER')::text as players
      from public.trades t
      left join public.trade_assets a
        on a.save_id = t.save_id and a.trade_id = t.trade_id
     where t.save_id = ${save.id} and t.season = ${save.season}
       and t.state = 'ACCEPTED'`;
  const deals = Number(count?.n ?? 0);
  const players = Number(count?.players ?? 0);

  return [{
    season: save.season, week: save.week, phase: save.phase,
    category: 'TRANSACTION', teamId: null, playerId: null, gameId: null,
    importance: 4,
    headline: deals === 0
      ? 'Deadline passes with the league standing still'
      : `Deadline day: ${String(deals)} trades across the league`,
    body: deals === 0
      ? 'The trade deadline has passed and not one deal was agreed all season. '
        + 'Rosters are what they are until the offseason.'
      : `The deadline has passed. ${String(deals)} trade${deals === 1 ? '' : 's'} `
        + `were agreed this season, moving ${String(players)} player`
        + `${players === 1 ? '' : 's'}. Nothing moves now until the offseason.`,
  }];
}
