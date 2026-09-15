// The other thirty-one clubs, dealing with each other.
//
// A trade system where only the manager trades is a shop, not a league. The
// point of this file is that a manager who does nothing at the deadline should
// still find the league changed when they look: a contender somewhere has
// bought a corner, a rebuilding club has sold its veteran end for a second,
// and the standings mean slightly something different than they did.
//
// Two things happen here each week. Computer-run clubs deal with each other,
// and computer-run clubs make offers for players the manager has listed. The
// second is what makes the trade block a thing you *use* rather than a flag
// you set -- listing a player and hearing nothing back forever is the same as
// not having listed him.

import type { Db } from './db.ts';
import type { SaveRow } from './save.ts';
import { seasonWeeks } from './save.ts';
import type { Rng } from '../engine/rng.ts';
import { tradeWindow } from './tradeWindow.ts';
import { valueAssets, type AssetRef } from './tradeAssets.ts';
import { clubTradeContext, type ClubTradeContext } from './tradeContext.ts';
import { evaluateTrade } from './tradeInterest.ts';
import { packageValue } from './tradeValue.ts';
import { APPETITE, type ValuedAsset } from './tradeStrategy.ts';
import { writeProposal } from './tradeDeal.ts';
import { executeTrade } from './tradeExecute.ts';
import { tradeStory } from './tradeNews.ts';
import { insertNews } from './news.ts';
import { parseSettings } from './franchiseOptions.ts';
import { GROUP_OF } from '../engine/careerWorld.ts';

/**
 * How many deals the league attempts in a week, by difficulty.
 *
 * Attempts, not completions: most of these fail, because most proposed trades
 * fail. The numbers are deliberately small. A league doing eight trades a week
 * would rewrite itself by December and the manager would be playing a
 * different competition every Sunday -- and the trades they made themselves
 * would stop meaning anything against that churn.
 */
const ATTEMPTS: Readonly<Record<string, number>> = {
  EASY: 4, NORMAL: 3, HARD: 2,
};

/** The last weeks before the deadline are busier, as they should be. */
const DEADLINE_RUSH = 2.5;

/** How far over the ask a single asset may go before it is an overpay nobody
 *  would make. */
const OVERPAY_CEILING = 1.7;
/** Three assets is a package; six is a club that has lost track. */
const MAX_PACKAGE = 3;

export interface CpuTradeRound {
  readonly attempted: number;
  readonly completed: number;
  readonly offersToUser: number;
}

/**
 * One week of the league's own trading.
 *
 * Runs inside the week transaction, after the save has moved on -- the same
 * ordering the waiver wire needed, and for the same reason: an offer made to
 * the manager has to arrive in a week they can still answer it in.
 */
export async function cpuTradeRound(
  db: Db, save: SaveRow, rng: Rng,
): Promise<CpuTradeRound> {
  const weeks = await seasonWeeks(db, save.id, save.season);
  const w = tradeWindow(save.phase, save.week, weeks, save.trade_deadline_week);
  if (!w.open) return { attempted: 0, completed: 0, offersToUser: 0 };

  const settings = parseSettings(save.franchise_settings);
  const difficulty = settings?.tradeDifficulty ?? 'NORMAL';
  const base = ATTEMPTS[difficulty] ?? 3;
  const attempts = Math.round(base * (w.weeksLeft <= 2 ? DEADLINE_RUSH : 1));

  const clubs = await db<{ team_id: string }[]>`
    select team_id from public.teams
     where save_id = ${save.id} and team_id <> ${save.user_team_id}
     order by team_id`;
  if (clubs.length < 2) return { attempted: 0, completed: 0, offersToUser: 0 };

  let completed = 0;
  for (let i = 0; i < attempts; i += 1) {
    const buyer = clubs[rng.int(0, clubs.length - 1)]?.team_id;
    const seller = clubs[rng.int(0, clubs.length - 1)]?.team_id;
    if (buyer === undefined || seller === undefined || buyer === seller) continue;
    if (await attemptTrade(db, save, buyer, seller, weeks)) completed += 1;
  }

  const offersToUser = await offerForListedPlayers(db, save, weeks, rng);
  return { attempted: attempts, completed, offersToUser };
}

/**
 * One club tries to buy one player from another.
 *
 * The buyer looks at a position it needs, finds the best player the seller has
 * there, and pays in whichever currency its own strategy prefers. Then the
 * seller judges it exactly as it would judge the manager's offer -- same
 * function, same margins, same reasons -- which is the only way to be sure the
 * league is playing the game the manager is playing.
 */
async function attemptTrade(
  db: Db, save: SaveRow, buyerId: string, sellerId: string, weeks: number,
): Promise<boolean> {
  const buyer = await clubTradeContext(
    db, save.id, save.season, save.week, weeks, buyerId, save.franchise_settings);
  const seller = await clubTradeContext(
    db, save.id, save.season, save.week, weeks, sellerId, save.franchise_settings);

  const wanted = topNeed(buyer);
  if (wanted === null) return false;

  const [target] = await db<{ player_id: string }[]>`
    select r.player_id
      from public.team_rosters r
      join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
     where r.save_id = ${save.id} and r.team_id = ${sellerId}
       and p.position = any(${positionsIn(wanted)}::text[])
       and p.overall_rating >= 72
     order by p.overall_rating desc
     limit 1`;
  if (target === undefined) return false;
  if (seller.untouchable.has(target.player_id)) return false;

  const get: readonly AssetRef[] = [{ kind: 'PLAYER', id: target.player_id }];
  // What the seller will ask, not what the player is worth: evaluateTrade
  // wants a margin over the value it gives up, and a package built to the bare
  // value is a package that is always just short.
  const asked = await valueAssets(db, save.id, save.season, get, sellerId);
  const need = packageValue(asked) * APPETITE[seller.strategy].margin;
  const give = await affordablePackage(db, save, buyerId, sellerId, need);
  if (give.length === 0) return false;

  const incoming = await valueAssets(db, save.id, save.season, give, sellerId);
  const outgoing = await valueAssets(db, save.id, save.season, get, sellerId);
  const evaluation = evaluateTrade({ incoming, outgoing }, seller);
  if (!evaluation.accepted) return false;

  const giving = await valueAssets(db, save.id, save.season, give, buyerId);
  const getting = await valueAssets(db, save.id, save.season, get, buyerId);
  const tradeId = await writeProposal(
    db, save, buyerId, sellerId, { give, get }, evaluation, giving, getting);
  const done = await executeTrade(db, save, tradeId);
  await insertNews(db, save.id, await tradeStory(db, save, done, 'CPU'));
  return true;
}

/**
 * A package the buyer can put together that is worth about what is being asked.
 *
 * Two mistakes were in the first version of this, and between them they meant
 * no computer-run club ever completed a trade with another -- which the league
 * cannot show and only a played season reveals.
 *
 * It took the cheapest picks first, capped at three. Three late picks across
 * three drafts are worth about five, against a player worth thirty, so the
 * package never reached the target and the function returned nothing, every
 * time, for every pair of clubs. The cap was meant to stop a club emptying its
 * draft; what it actually stopped was any deal at all.
 *
 * And it added up raw values while the seller judges the package through
 * packageValue, which deliberately discounts everything after the best piece.
 * A package that cleared the bar by this function's arithmetic was still short
 * by the arithmetic that decided.
 *
 * So: aim at what will actually be asked, measure with the function that will
 * actually measure, and prefer the smallest single asset that does the job --
 * which is also how most real deadline deals are shaped.
 */
async function affordablePackage(
  db: Db, save: SaveRow, buyerId: string, sellerId: string, target: number,
): Promise<readonly AssetRef[]> {
  // Picks: they cost no roster place and no cap, which is why they are the
  // currency of most deadline deals.
  const picks = await db<{ pick_id: string }[]>`
    select pick_id from public.draft_picks
     where save_id = ${save.id} and current_owner_team_id = ${buyerId}
       and selected_player_id is null
     order by draft_year, round`;
  if (picks.length === 0) return [];

  const priced = await valueAssets(
    db, save.id, save.season,
    picks.map((p): AssetRef => ({ kind: 'PICK', id: p.pick_id })), sellerId);
  const descending = [...priced].sort((a, b) => b.value - a.value);

  // One asset that does it, and the smallest such: a club that led with its
  // best pick whenever a worse one would have done is negotiating badly.
  const single = [...priced]
    .sort((a, b) => a.value - b.value)
    .find((a) => a.value >= target && a.value <= target * OVERPAY_CEILING);
  if (single !== undefined) return [{ kind: single.kind, id: single.id }];

  // Otherwise build one, largest first, stopping as soon as the package is
  // worth what is being asked -- measured the way the seller will measure it.
  const chosen: ValuedAsset[] = [];
  for (const asset of descending) {
    if (packageValue(chosen) >= target) break;
    if (chosen.length >= MAX_PACKAGE) break;
    // Never hand over a pick that alone is worth far more than the whole ask.
    if (asset.value > target * OVERPAY_CEILING && chosen.length === 0) continue;
    chosen.push(asset);
  }
  if (packageValue(chosen) < target * 0.92) return [];
  return chosen.map((a) => ({ kind: a.kind, id: a.id }));
}

/**
 * Offers for the players the manager has listed.
 *
 * The block is a request to be called about, so clubs call. What they offer is
 * built the same way a CPU-to-CPU package is, and it is left as a PROPOSED row
 * for the manager to answer -- this is the one place in the feature where a
 * trade waits for a person.
 */
async function offerForListedPlayers(
  db: Db, save: SaveRow, weeks: number, rng: Rng,
): Promise<number> {
  const listed = await db<{ player_id: string; position: string; overall_rating: number }[]>`
    select b.player_id, p.position, p.overall_rating
      from public.trade_block b
      join public.players p on p.save_id = b.save_id and p.player_id = b.player_id
     where b.save_id = ${save.id} and b.team_id = ${save.user_team_id}
     order by p.overall_rating desc
     limit 3`;
  if (listed.length === 0) return 0;

  // One caller a week at most. A manager who lists a player and is buried in
  // six offers has been given a chore rather than a market.
  const target = listed[rng.int(0, listed.length - 1)];
  if (target === undefined) return 0;

  // Already asked about this week? Then nobody calls twice.
  const [open] = await db<{ n: string }[]>`
    select count(*)::text as n from public.trades t
      join public.trade_assets a on a.save_id = t.save_id and a.trade_id = t.trade_id
     where t.save_id = ${save.id} and t.state = 'PROPOSED'
       and t.to_team_id = ${save.user_team_id} and a.player_id = ${target.player_id}`;
  if (Number(open?.n ?? 0) > 0) return 0;

  const clubs = await db<{ team_id: string }[]>`
    select t.team_id from public.teams t
     where t.save_id = ${save.id} and t.team_id <> ${save.user_team_id}
     order by t.team_id`;
  const buyerId = clubs[rng.int(0, Math.max(0, clubs.length - 1))]?.team_id;
  if (buyerId === undefined) return 0;

  const buyer = await clubTradeContext(
    db, save.id, save.season, save.week, weeks, buyerId, save.franchise_settings);
  const group = target.position;
  // A club only calls about a position it actually needs. Otherwise the block
  // produces offers nobody meant, which is noise wearing the shape of a market.
  const wanted = topNeed(buyer);
  if (wanted === null || !positionsIn(wanted).includes(group)) return 0;

  const get: readonly AssetRef[] = [{ kind: 'PLAYER', id: target.player_id }];
  const asked = await valueAssets(db, save.id, save.season, get, buyerId);
  // They open a little under what he is worth, which is what an opening offer
  // is. The manager can counter by proposing back.
  const need = packageValue(asked) * 0.85;
  const give = await affordablePackage(
    db, save, buyerId, save.user_team_id, need);
  if (give.length === 0) return 0;

  const giving = await valueAssets(db, save.id, save.season, give, save.user_team_id);
  const getting = await valueAssets(db, save.id, save.season, get, save.user_team_id);
  await writeProposal(
    db, save, buyerId, save.user_team_id, { give, get }, null, giving, getting);
  return 1;
}

/** The group this club most needs, or null where it needs nothing much. */
function topNeed(club: ClubTradeContext): string | null {
  let best: { group: string; need: number } | null = null;
  for (const [group, need] of Object.entries(club.needs)) {
    if (best === null || need > best.need) best = { group, need };
  }
  return best !== null && best.need >= 0.4 ? best.group : null;
}

/** The positions inside an engine group, for matching a roster against it. */
function positionsIn(group: string): readonly string[] {
  return Object.keys(GROUP_OF).filter((p) => GROUP_OF[p] === group);
}
