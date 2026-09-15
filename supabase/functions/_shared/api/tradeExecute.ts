// Carrying a trade out.
//
// The request lists ten things a completed trade must move, and the reason it
// lists ten is that a trade which moves eight of them looks finished from
// every screen a person opens. This is the function where forgetting one is
// possible, so the list is here, in order, and nothing else in this feature
// moves a player.
//
//   the roster        team_rosters, and players.team_id that every read joins
//   the depth chart   a traded player left on one is a player the week runner
//                     will try to field for a club he does not play for
//   the contract      moved, not rewritten: a trade takes the deal over
//   the cap           both clubs' sheets, recomputed from the rows
//   the picks         draft_picks.current_owner_team_id
//   the engine        the save document, which is what actually plays games
//   the history       one transaction row per asset, both directions
//   player history    which club he was on, and when
//   the news          for the ones worth reporting
//   morale            the player has an opinion about being moved

import type { Db } from './db.ts';
import type { SaveRow } from './save.ts';
import { applyDocumentMove } from './engineRoster.ts';
import { assignToRoster, refreshCapSheet } from './rosterSpace.ts';
import { clubNames, logMoves, money, type Move, type MoveContext } from './transactionLog.ts';
import { assetsOf } from './tradeDeal.ts';
import { moraleAfterTrade } from './tradeMorale.ts';
import type { AssetRef } from './tradeAssets.ts';

export interface ExecutedTrade {
  readonly tradeId: number;
  readonly teams: readonly [string, string];
  readonly moved: number;
  /** What each club received, for the story and the confirmation. */
  readonly received: ReadonlyMap<string, readonly string[]>;
}

/**
 * Executes a written, agreed trade.
 *
 * Everything inside the caller's transaction: a half-applied trade is two
 * clubs disagreeing about who owns a quarterback, and there is no screen in
 * this game that could show that usefully.
 */
export async function executeTrade(
  db: Db, save: SaveRow, tradeId: number,
): Promise<ExecutedTrade> {
  const [trade] = await db<{ from_team_id: string; to_team_id: string; state: string }[]>`
    select from_team_id, to_team_id, state from public.trades
     where save_id = ${save.id} and trade_id = ${tradeId}`;
  if (trade === undefined) throw new Error(`Trade ${String(tradeId)} is not on record`);

  const { byTeam } = await assetsOf(db, save.id, tradeId);
  const a = trade.from_team_id;
  const b = trade.to_team_id;
  const received = new Map<string, string[]>([[a, []], [b, []]]);
  const moves: Move[] = [];
  let moved = 0;

  // Each club's assets go to the other one. Read before anything is written,
  // so a player moving one way cannot be seen by the query that moves the
  // other -- which is the bug a two-pass version of this would have.
  for (const [from, assets] of byTeam) {
    const to = from === a ? b : a;
    for (const asset of assets) {
      const label = await moveAsset(db, save, asset, from, to);
      received.get(to)?.push(label.label);
      moves.push(...label.moves);
      moved += 1;
    }
  }

  // The cap sheets, once each, after every contract has moved.
  await refreshCapSheet(db, save.id, save.season, a);
  await refreshCapSheet(db, save.id, save.season, b);

  const ctx: MoveContext = {
    saveId: save.id, season: save.season, week: save.week, phase: save.phase,
    userTeamId: save.user_team_id, clubNames: await clubNames(db, save.id),
  };
  await logMoves(db, ctx, moves);

  await db`
    update public.trades set state = 'ACCEPTED', resolved_at = now()
     where save_id = ${save.id} and trade_id = ${tradeId}`;

  return { tradeId, teams: [a, b], moved, received };
}

interface MovedAsset {
  readonly label: string;
  readonly moves: readonly Move[];
}

/** One asset, from one club to the other. */
async function moveAsset(
  db: Db, save: SaveRow, asset: AssetRef, from: string, to: string,
): Promise<MovedAsset> {
  if (asset.kind === 'PICK') {
    const [pick] = await db<{ draft_year: number; round: number }[]>`
      update public.draft_picks set current_owner_team_id = ${to}
       where save_id = ${save.id} and pick_id = ${asset.id}
         and current_owner_team_id = ${from}
      returning draft_year, round`;
    if (pick === undefined) {
      throw new Error(`Pick ${asset.id} was not ${from}'s to trade`);
    }
    const label = `${String(pick.draft_year)} round ${String(pick.round)} pick`;
    return {
      label,
      // A pick has no player and no cap charge, so it is logged as part of the
      // deal rather than as a move of its own -- the transaction rows below
      // carry it in their detail, where a person reading the history sees the
      // whole package rather than a row saying "a pick moved".
      moves: [],
    };
  }

  const [player] = await db<{
    display_name: string; position: string; overall_rating: number;
    aav: string | null; morale: number | null;
  }[]>`
    select p.display_name, p.position, p.overall_rating, p.morale,
           c.average_annual_value::text as aav
      from public.players p
      left join public.player_contracts c
        on c.save_id = p.save_id and c.player_id = p.player_id
       and c.contract_status = 'ACTIVE'
     where p.save_id = ${save.id} and p.player_id = ${asset.id}`;
  if (player === undefined) throw new Error(`Player ${asset.id} is not on record`);

  // The roster and a jersey he is allowed to wear, through the same helper
  // every other move uses.
  await assignToRoster(
    db, save.id, asset.id, to, 'TRADE', save.season, player.position);
  await db`
    update public.players set team_id = ${to}
     where save_id = ${save.id} and player_id = ${asset.id}`;
  // Off the old club's chart. A traded player left on one is a player the week
  // runner will try to field for a club he no longer plays for.
  await db`
    delete from public.team_depth_charts
     where save_id = ${save.id} and team_id = ${from} and player_id = ${asset.id}`;
  // The contract moves rather than being rewritten: a trade takes the deal
  // over, which is the whole reason an expensive one is hard to move.
  await db`
    update public.player_contracts set team_id = ${to}
     where save_id = ${save.id} and player_id = ${asset.id}
       and contract_status = 'ACTIVE'`;

  const aav = Number(player.aav ?? 0);
  // The engine's own state, which is the copy that picks the eleven.
  await applyDocumentMove(db, save.id, {
    playerId: asset.id, teamId: to,
    contract: aav === 0 ? null : await documentContract(db, save, asset.id),
    previousTeamId: from,
  });

  // How he feels about it, where that is knowable.
  const morale = moraleAfterTrade(player.morale);
  if (morale !== null) {
    await db`
      update public.players set morale = ${morale}
       where save_id = ${save.id} and player_id = ${asset.id}`;
  }
  // Off the block: he has been traded, which is what the block was for.
  await db`
    delete from public.trade_block
     where save_id = ${save.id} and player_id = ${asset.id}`;

  const label = `${player.position} ${player.display_name}`;
  return {
    label,
    moves: [{
      kind: 'TRADE', teamId: to, playerId: asset.id,
      playerName: player.display_name, position: player.position,
      overall: player.overall_rating, capImpact: aav, fromTeamId: from,
      detail: aav > 0
        ? `Acquired by trade; ${money(aav)} a year`
        : 'Acquired by trade',
    }],
  };
}

/** The deal as the save document records it, read back after the move. */
async function documentContract(
  db: Db, save: SaveRow, playerId: string,
): Promise<{ aav: number; years: number; yearsRemaining: number; guaranteed: number; signedSeason: number } | null> {
  const [row] = await db<{
    aav: string; years_total: number | null; years_remaining: number | null;
    guaranteed: string | null; start_year: number | null;
  }[]>`
    select average_annual_value::text as aav, years_total, years_remaining,
           guaranteed_money::text as guaranteed, start_year
      from public.player_contracts
     where save_id = ${save.id} and player_id = ${playerId}
       and contract_status = 'ACTIVE'`;
  if (row === undefined) return null;
  return {
    aav: Number(row.aav), years: row.years_total ?? 1,
    yearsRemaining: row.years_remaining ?? 1,
    guaranteed: Number(row.guaranteed ?? 0),
    signedSeason: row.start_year ?? save.season,
  };
}
