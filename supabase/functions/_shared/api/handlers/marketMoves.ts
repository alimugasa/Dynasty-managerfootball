// The four things a manager can do to the market during a season.
//
// Claim a player off the wire, withdraw a claim before it is settled, ask a
// free agent what he thinks of an offer, and sign him. All four take the save
// row's lock, like every other write, so two tabs cannot put two claims in for
// one club or sign the same man twice.
//
// The offer is deliberately one route rather than two. A quote and a signing
// are the same calculation, and a screen that quoted from one path and signed
// through another would eventually show a probability it did not honour. Ask
// with `commit: false` for the number; ask with `commit: true` to hear his
// answer and, if it is yes, to have him.

import { badRequest, type Handler, type HandlerContext } from '../context.ts';
import { ownedSave, seasonWeeks, type SaveRow } from '../save.ts';
import { rawOf, optionalInt, optionalString, requireString } from '../parse.ts';
import type { Db } from '../db.ts';
import { cancelClaim, submitClaim, type ClaimResult } from '../waivers.ts';
import { clubContext } from '../cpuMarket.ts';
import {
  offerToFreeAgent, quoteSigning, suggestedTerms, marketPlayer,
  type SignQuote, type SigningOutcome,
} from '../signFreeAgent.ts';
import { inSeasonAsk, type DesiredRole } from '../inSeasonMarket.ts';
import { capRules } from '../../engine/offseason/frontOffice.ts';
import { clubNames, logMove, money } from '../transactionLog.ts';

interface SaveOnly { readonly saveId: string }

function locked<In extends SaveOnly, Out>(
  work: (tx: Db, save: SaveRow, input: In) => Promise<Out>,
): (ctx: HandlerContext, input: In) => Promise<Out> {
  return ({ sql, userId }, input) => sql.begin(async (tx) => {
    await tx`select 1 from public.saves where id = ${input.saveId} for update`;
    const save = await ownedSave(tx, userId, input.saveId);
    return work(tx, save, input);
  }) as Promise<Out>;
}

/** The market is open for as long as there is a season to sign into. */
function requireInSeason(save: SaveRow): void {
  if (save.phase !== 'REGULAR_SEASON' && save.phase !== 'PLAYOFFS') {
    throw badRequest('The waiver wire and the free-agent market run during the season');
  }
}

// ---------------------------------------------------------------- claiming

export interface ClaimIn { readonly saveId: string; readonly playerId: string }

export const claimPlayer: Handler<ClaimIn, ClaimResult> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), playerId: requireString(r, 'playerId') };
  },
  run: locked(async (tx, save, input) => {
    requireInSeason(save);
    return submitClaim(tx, save.id, save.season, save.week, save.user_team_id, input.playerId);
  }),
};

export const withdrawClaim: Handler<ClaimIn, { readonly playerId: string }> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), playerId: requireString(r, 'playerId') };
  },
  run: locked(async (tx, save, input) => {
    requireInSeason(save);
    return cancelClaim(tx, save.id, save.season, save.week, save.user_team_id, input.playerId);
  }),
};

// ------------------------------------------------------------- the offer

export interface OfferIn {
  readonly saveId: string;
  readonly playerId: string;
  /** Null asks for the terms he would take, rather than naming any. */
  readonly aav: number | null;
  readonly years: number | null;
  readonly role: DesiredRole | null;
  readonly commit: boolean;
}

export interface OfferOut {
  readonly quote: SignQuote;
  /** The deal he is asking for, so the sheet can open on a number that works. */
  readonly suggested: { readonly aav: number; readonly years: number; readonly role: DesiredRole };
  /** Null until the offer is actually put to him. */
  readonly outcome: SigningOutcome | null;
}

const ROLES = new Set(['STARTER', 'ROTATION', 'DEPTH']);

export const offerContract: Handler<OfferIn, OfferOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const role = optionalString(r, 'role') ?? null;
    if (role !== null && !ROLES.has(role)) throw badRequest('role must be STARTER, ROTATION or DEPTH');
    const years = optionalInt(r, 'years') ?? null;
    if (years !== null && (years < 1 || years > 5)) {
      throw badRequest('A contract runs between one and five years');
    }
    const aav = optionalInt(r, 'aav') ?? null;
    if (aav !== null && aav < 0) throw badRequest('A salary cannot be negative');
    return {
      saveId: requireString(r, 'saveId'),
      playerId: requireString(r, 'playerId'),
      aav, years, role: role as DesiredRole | null,
      commit: r['commit'] === true,
    };
  },
  run: locked(async (tx, save, input) => {
    requireInSeason(save);
    const weeks = await seasonWeeks(tx, save.id, save.season);
    const player = await marketPlayer(tx, save.id, save.season, input.playerId);
    const rules = capRules(save.season);
    const ask = inSeasonAsk(player, save.week, weeks, rules.veteranMinimum);
    const wanted = suggestedTerms(player, ask);
    const club = await clubContext(tx, save.id, save.season, save.user_team_id, player.position);

    const terms = {
      playerId: input.playerId,
      aav: input.aav ?? wanted.aav,
      years: input.years ?? wanted.years,
      role: input.role ?? wanted.role,
    };

    const quote = await quoteSigning(
      tx, save, save.user_team_id, terms, save.week, weeks, club.contention, club.need);
    if (!input.commit) {
      return { quote, suggested: { aav: wanted.aav, years: wanted.years, role: wanted.role }, outcome: null };
    }

    const outcome = await offerToFreeAgent(
      tx, save, save.user_team_id, terms, save.week, weeks, club.contention, club.need);
    if (outcome.verdict.kind === 'ACCEPTED') {
      await logMove(tx, {
        saveId: save.id, season: save.season, week: save.week, phase: save.phase,
        userTeamId: save.user_team_id, clubNames: await clubNames(tx, save.id),
      }, {
        kind: 'FREE_AGENT_SIGNING', teamId: save.user_team_id,
        playerId: outcome.playerId, playerName: outcome.playerName,
        position: outcome.position, overall: player.overall,
        capImpact: outcome.aav, fromTeamId: player.previousTeamId,
        detail: `${String(outcome.years)} year${outcome.years === 1 ? '' : 's'} `
          + `at ${money(outcome.aav)} a year`,
      });
    }
    return {
      quote, suggested: { aav: wanted.aav, years: wanted.years, role: wanted.role }, outcome,
    };
  }),
};
