// Every move, written down twice.
//
// A transaction row is the record: complete, dull, and queryable, which is
// what the league transaction history reads. A news story is the telling: only
// for the moves worth telling, written about the club being managed or about
// somebody good enough that the league noticed.
//
// Keeping both behind one call is the point. The waiver wire has four ways to
// move a player -- released, claimed, cleared, signed -- and every one of them
// used to be a place where a handler could remember the transaction and forget
// the story, or the other way round. Now a move that is logged is a move that
// is told about, and the decision about *whether* to tell is made here, once,
// on the facts rather than on which handler happened to call.

import type { Db } from './db.ts';
import { insertNews } from './news.ts';
import type { NewsRow } from './franchiseNews.ts';

/** How good a player has to be for the league to notice him changing clubs.
 *  Below this a signing is a transaction, not a story. */
export const NOTABLE_OVERALL = 74;

export type MoveKind = 'RELEASE' | 'WAIVER_CLAIM' | 'FREE_AGENT_SIGNING';

export interface Move {
  readonly kind: MoveKind;
  readonly teamId: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly position: string;
  readonly overall: number;
  /** What it does to the club's cap this season: dead money on a release, the
   *  new charge on a signing or a claim. */
  readonly capImpact: number;
  readonly detail: string;
  /** The club he came from, where the move has one. */
  readonly fromTeamId: string | null;
}

export interface MoveContext {
  readonly saveId: string;
  readonly season: number;
  readonly week: number;
  readonly phase: string;
  /** The club the player is managing, which decides what counts as their news
   *  rather than the league's. */
  readonly userTeamId: string;
  readonly clubNames: ReadonlyMap<string, string>;
}

/** Writes the record, and the story if there is one. */
export async function logMove(db: Db, ctx: MoveContext, move: Move): Promise<void> {
  await db`
    insert into public.transactions (
      save_id, season, week, phase, kind, team_id, counterparty_team_id,
      player_id, player_name, detail, cap_impact)
    values (${ctx.saveId}, ${ctx.season}, ${ctx.week}, ${ctx.phase}, ${move.kind},
            ${move.teamId}, ${move.fromTeamId}, ${move.playerId}, ${move.playerName},
            ${move.detail}, ${move.capImpact})`;
  const story = storyFor(ctx, move);
  if (story !== null) await insertNews(db, ctx.saveId, [story]);
}

/** Several moves, in one pass. */
export async function logMoves(
  db: Db, ctx: MoveContext, moves: readonly Move[],
): Promise<void> {
  for (const move of moves) await logMove(db, ctx, move);
}

const club = (ctx: MoveContext, teamId: string | null): string =>
  teamId === null ? 'his former club' : ctx.clubNames.get(teamId) ?? teamId;

/**
 * Whether a move is news, and what the story says.
 *
 * Two things make a move worth a story: it happened to the club being managed,
 * or the player is good enough that it would be reported anywhere. Everything
 * else is in the transaction log and can be read there -- a feed carrying all
 * thirty-two clubs' depth signings would bury the week's football under it.
 *
 * Written without a pronoun for the player. The league stores no gender for
 * anybody, so "he" would be an invention repeated a hundred times a season.
 */
export function storyFor(ctx: MoveContext, move: Move): NewsRow | null {
  const mine = move.teamId === ctx.userTeamId || move.fromTeamId === ctx.userTeamId;
  const notable = move.overall >= NOTABLE_OVERALL;
  if (!mine && !notable) return null;

  const who = `${move.position} ${move.playerName}`;
  const to = club(ctx, move.teamId);
  const base = {
    season: ctx.season, week: ctx.week, phase: ctx.phase,
    category: 'TRANSACTION' as const,
    teamId: move.teamId, playerId: move.playerId, gameId: null,
    // A move involving the managed club leads the feed; one that merely
    // happened somewhere sits below the week's football.
    importance: mine ? (notable ? 4 : 3) : 3,
  };

  switch (move.kind) {
    case 'RELEASE':
      return {
        ...base,
        headline: `${to} release ${who}`,
        body: `${to} have released ${who}. ${move.detail}.`,
      };
    case 'WAIVER_CLAIM':
      return {
        ...base,
        headline: `${to} claim ${who} off waivers`,
        body: `${to} have been awarded ${who} on a waiver claim from `
          + `${club(ctx, move.fromTeamId)}. ${move.detail}.`,
      };
    case 'FREE_AGENT_SIGNING':
      return {
        ...base,
        headline: `${to} sign ${who}`,
        body: `${to} have signed ${who}. ${move.detail}.`,
      };
  }
}

/** The one notice a losing claimant gets: somebody else got him. */
export function missedClaimStory(
  ctx: MoveContext, teamId: string, playerName: string, position: string,
  playerId: string, awardedTo: string | null, reason: string | null,
): NewsRow {
  const lost = awardedTo === null
    ? `${position} ${playerName} cleared waivers and is now a free agent`
    : `${position} ${playerName} was awarded to ${club(ctx, awardedTo)}`;
  return {
    season: ctx.season, week: ctx.week, phase: ctx.phase,
    category: 'TRANSACTION', teamId, playerId, gameId: null,
    importance: 3,
    headline: `Waiver claim unsuccessful: ${playerName}`,
    // Why, when there is a why. A claim that lost on priority lost fairly and
    // the notice says so; a claim that was passed over for want of room is a
    // different thing entirely and the manager needs to know which happened.
    body: `${lost}. ${reason ?? 'A club ahead in the waiver order claimed first'}.`,
  };
}

/** Club names for the stories, read once per resolution. */
export async function clubNames(db: Db, saveId: string): Promise<ReadonlyMap<string, string>> {
  const rows = await db<{ team_id: string; metro_area: string; nickname: string }[]>`
    select team_id, metro_area, nickname from public.teams where save_id = ${saveId}`;
  return new Map(rows.map((r) => [r.team_id, `${r.metro_area} ${r.nickname}`]));
}

/** A money figure as a story would say it. */
export const money = (n: number): string =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${String(Math.round(n / 1000))}K`;
