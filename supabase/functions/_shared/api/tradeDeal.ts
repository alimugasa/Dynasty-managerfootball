// Proposing a trade, and answering one.
//
// A package is written down before it is judged, and judged from the rows
// rather than from what the client sent. That ordering is the whole security
// model of this feature: a client that sent its own valuations could buy a
// franchise quarterback for a seventh-round pick by saying the pick was worth
// ninety, and nothing downstream would know.
//
// A proposal is a row in `trades` plus its assets. It lives through exactly
// one of five endings -- accepted, rejected, countered, withdrawn, expired --
// and the reason it ended is kept with it, because the history is most useful
// on the deals that did not happen.

import type { Db } from './db.ts';
import { badRequest, notFound } from './context.ts';
import type { SaveRow } from './save.ts';
import { seasonWeeks } from './save.ts';
import { tradeWindow } from './tradeWindow.ts';
import { valueAssets, type AssetRef } from './tradeAssets.ts';
import { clubTradeContext, type ClubTradeContext } from './tradeContext.ts';
import {
  counterFor, evaluateTrade, interestFill, type Counter, type Evaluation,
} from './tradeInterest.ts';
import type { ValuedAsset } from './tradeStrategy.ts';

export interface PackageIn {
  /** What the proposing club sends. */
  readonly give: readonly AssetRef[];
  /** What it asks for. */
  readonly get: readonly AssetRef[];
}

export interface TradeQuote {
  readonly interest: Evaluation['interest'];
  readonly reasons: readonly string[];
  readonly accepted: boolean;
  readonly blocked: string | null;
  readonly valueOffered: number;
  readonly valueAsked: number;
  /** 0-1, for the meter under the label. */
  readonly fill: number;
  readonly counter: Counter | null;
  /** The other club, as the screen shows it. */
  readonly them: {
    readonly teamId: string;
    readonly name: string;
    readonly strategy: string;
    readonly record: string;
    readonly needs: readonly string[];
  };
  /** Every asset, priced, so the screen can show its working. */
  readonly giving: readonly ValuedAsset[];
  readonly getting: readonly ValuedAsset[];
}

/** Trading is shut outside the window, and the refusal names which shut. */
export async function requireWindowOpen(db: Db, save: SaveRow): Promise<void> {
  const weeks = await seasonWeeks(db, save.id, save.season);
  const w = tradeWindow(save.phase, save.week, weeks, save.trade_deadline_week);
  if (!w.open) throw badRequest(w.closedBecause ?? 'Trading is not open');
}

/**
 * What the other club makes of a package, without proposing it.
 *
 * The screen calls this on every change while a manager builds a deal, so it
 * writes nothing at all. It is also the same call that decides an actual
 * proposal -- one path, so the meter cannot promise something the proposal
 * then refuses.
 */
export async function quoteTrade(
  db: Db, save: SaveRow, withTeamId: string, pkg: PackageIn,
): Promise<TradeQuote> {
  if (withTeamId === save.user_team_id) {
    throw badRequest('A club cannot trade with itself');
  }
  const them = await clubTradeContext(
    db, save.id, save.season, save.week,
    await seasonWeeks(db, save.id, save.season), withTeamId, save.franchise_settings);

  await requireOwnership(db, save.id, save.user_team_id, pkg.give);
  await requireOwnership(db, save.id, withTeamId, pkg.get);

  // Priced twice, in each club's own terms: what they receive is valued for
  // them, and what they give up is valued for them as well. A single neutral
  // price would make every club agree about every deal.
  const incoming = await valueAssets(db, save.id, save.season, pkg.give, withTeamId);
  const outgoing = await valueAssets(db, save.id, save.season, pkg.get, withTeamId);
  // And what the manager is getting, priced for the managed club, which is the
  // number the screen shows on their own side of the table.
  const mine = await valueAssets(db, save.id, save.season, pkg.get, save.user_team_id);

  const evaluation = evaluateTrade({ incoming, outgoing }, them);
  return {
    interest: evaluation.interest,
    reasons: evaluation.reasons,
    accepted: evaluation.accepted,
    blocked: evaluation.blocked,
    valueOffered: evaluation.valueOffered,
    valueAsked: evaluation.valueAsked,
    fill: interestFill(evaluation),
    counter: counterFor(evaluation, them),
    them: {
      teamId: them.teamId, name: them.name, strategy: them.strategy,
      record: `${String(them.record.wins)}-${String(them.record.losses)}`
        + (them.record.ties > 0 ? `-${String(them.record.ties)}` : ''),
      needs: them.needLabels,
    },
    giving: await valueAssets(db, save.id, save.season, pkg.give, save.user_team_id),
    getting: mine,
  };
}

/**
 * Every asset in a package must actually belong to the club offering it.
 *
 * Checked on the server because it is the one rule a client cannot be trusted
 * with: a package naming another club's quarterback would otherwise execute
 * and move a player nobody agreed to move.
 */
export async function requireOwnership(
  db: Db, saveId: string, teamId: string, refs: readonly AssetRef[],
): Promise<void> {
  for (const ref of refs) {
    if (ref.kind === 'PLAYER') {
      const [row] = await db<{ team_id: string }[]>`
        select team_id from public.team_rosters
         where save_id = ${saveId} and player_id = ${ref.id}`;
      if (row === undefined) throw notFound(`player ${ref.id}`);
      if (row.team_id !== teamId) {
        throw badRequest('A club can only trade players on its own roster');
      }
    } else {
      const [row] = await db<{ owner: string; used: string | null }[]>`
        select current_owner_team_id as owner, selected_player_id as used
          from public.draft_picks
         where save_id = ${saveId} and pick_id = ${ref.id}`;
      if (row === undefined) throw notFound(`pick ${ref.id}`);
      if (row.owner !== teamId) {
        throw badRequest('A club can only trade picks it owns');
      }
      // A pick that has already been used is a piece of history, not an asset.
      if (row.used !== null) throw badRequest('That pick has already been used');
    }
  }
}

export interface ProposedTrade {
  readonly tradeId: number;
  readonly quote: TradeQuote;
  /** Set when the other club answered at once, which a CPU club always does. */
  readonly answer: 'ACCEPTED' | 'REJECTED' | 'COUNTERED' | null;
  /** The counter they made instead, where they made one. */
  readonly counterTradeId: number | null;
}

/** Writes a proposal and its assets, and returns its id. */
export async function writeProposal(
  db: Db, save: SaveRow, fromTeamId: string, toTeamId: string,
  pkg: PackageIn, evaluation: {
    readonly interest: string; readonly reasons: readonly string[];
    readonly valueOffered: number; readonly valueAsked: number;
  } | null,
  giving: readonly ValuedAsset[], getting: readonly ValuedAsset[],
): Promise<number> {
  const [row] = await db<{ trade_id: string }[]>`
    insert into public.trades (
      save_id, season, week, phase, from_team_id, to_team_id, state,
      interest, reasons, value_offered, value_asked)
    values (${save.id}, ${save.season}, ${save.week}, ${save.phase},
            ${fromTeamId}, ${toTeamId}, 'PROPOSED',
            ${evaluation?.interest ?? null},
            ${evaluation === null ? null : [...evaluation.reasons]}::text[],
            ${evaluation?.valueOffered ?? null}, ${evaluation?.valueAsked ?? null})
    returning trade_id::text`;
  const tradeId = Number(row?.trade_id ?? 0);

  const assets = [
    ...pkg.give.map((a) => ({ ...a, from: fromTeamId })),
    ...pkg.get.map((a) => ({ ...a, from: toTeamId })),
  ];
  const valued = new Map([...giving, ...getting].map((a) => [a.id, a.value]));
  if (assets.length > 0) {
    await db`
      insert into public.trade_assets (
        save_id, trade_id, from_team_id, kind, player_id, pick_id, value)
      select ${save.id}, ${tradeId}, u.from_team, u.kind,
             case when u.kind = 'PLAYER' then u.asset_id end,
             case when u.kind = 'PICK' then u.asset_id end,
             u.value
        from unnest(
          ${assets.map((a) => a.from)}::text[],
          ${assets.map((a) => a.kind)}::text[],
          ${assets.map((a) => a.id)}::text[],
          ${assets.map((a) => valued.get(a.id) ?? null)}::numeric[]
        ) as u(from_team, kind, asset_id, value)`;
  }
  return tradeId;
}

/** The assets of a written trade, read back as refs. */
export async function assetsOf(
  db: Db, saveId: string, tradeId: number,
): Promise<{ readonly byTeam: ReadonlyMap<string, AssetRef[]> }> {
  const rows = await db<{
    from_team_id: string; kind: string; player_id: string | null; pick_id: string | null;
  }[]>`
    select from_team_id, kind, player_id, pick_id from public.trade_assets
     where save_id = ${saveId} and trade_id = ${tradeId}
     order by asset_id`;
  const byTeam = new Map<string, AssetRef[]>();
  for (const row of rows) {
    const id = row.kind === 'PLAYER' ? row.player_id : row.pick_id;
    if (id === null) continue;
    const list = byTeam.get(row.from_team_id) ?? [];
    list.push({ kind: row.kind === 'PLAYER' ? 'PLAYER' : 'PICK', id });
    byTeam.set(row.from_team_id, list);
  }
  return { byTeam };
}

export type { ClubTradeContext };
