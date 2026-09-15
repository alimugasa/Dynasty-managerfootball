// The league's transaction history.
//
// Every move any club has made, newest first, with a filter for the club and
// one for the kind. It reads the transactions table and nothing else, which is
// the point of having written every move there: the history is not assembled
// from four different tables that might disagree about what happened, it is
// the record itself.
//
// The season defaults to the one being played and can be asked for by number,
// because "every waiver claim, cut and signing" is a question about a season
// rather than about all time -- a franchise fifteen years in would otherwise
// open this screen onto twenty thousand rows.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, optionalInt, optionalString, requireString } from '../parse.ts';

export interface TransactionsIn {
  readonly saveId: string;
  readonly season: number | null;
  readonly teamId: string | null;
  readonly kind: string | null;
  readonly limit: number;
}

export interface TransactionRow {
  readonly id: number;
  readonly season: number;
  readonly week: number | null;
  readonly phase: string;
  readonly kind: string;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly counterpartyTeamId: string | null;
  readonly counterpartyTeamName: string | null;
  readonly playerId: string | null;
  readonly playerName: string | null;
  readonly detail: string | null;
  readonly capImpact: number | null;
  readonly mine: boolean;
}

export interface TransactionsOut {
  readonly season: number;
  readonly seasons: readonly number[];
  readonly rows: readonly TransactionRow[];
}

interface Row {
  transaction_id: string; season: number; week: number | null; phase: string;
  kind: string; team_id: string | null; team_name: string | null;
  counterparty_team_id: string | null; counterparty_team_name: string | null;
  player_id: string | null; player_name: string | null;
  detail: string | null; cap_impact: string | null;
}

export const transactions: Handler<TransactionsIn, TransactionsOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return {
      saveId: requireString(r, 'saveId'),
      season: optionalInt(r, 'season') ?? null,
      teamId: optionalString(r, 'teamId') ?? null,
      kind: optionalString(r, 'kind') ?? null,
      limit: Math.min(300, Math.max(1, optionalInt(r, 'limit') ?? 120)),
    };
  },
  run: async ({ sql, userId }, input) => {
    const save = await ownedSave(sql, userId, input.saveId);
    const season = input.season ?? save.season;
    const rows = await sql<Row[]>`
      select t.transaction_id::text, t.season, t.week, t.phase, t.kind,
             t.team_id, a.metro_area || ' ' || a.nickname as team_name,
             t.counterparty_team_id,
             b.metro_area || ' ' || b.nickname as counterparty_team_name,
             t.player_id, t.player_name, t.detail, t.cap_impact::text
        from public.transactions t
        left join public.teams a on a.save_id = t.save_id and a.team_id = t.team_id
        left join public.teams b
          on b.save_id = t.save_id and b.team_id = t.counterparty_team_id
       where t.save_id = ${save.id} and t.season = ${season}
         and (${input.teamId}::text is null
              or t.team_id = ${input.teamId}
              or t.counterparty_team_id = ${input.teamId})
         and (${input.kind}::text is null or t.kind = ${input.kind})
       order by t.transaction_id desc
       limit ${input.limit}`;

    const seasons = await sql<{ season: number }[]>`
      select distinct season from public.transactions
       where save_id = ${save.id} order by season desc`;

    return {
      season,
      seasons: seasons.map((s) => s.season),
      rows: rows.map((r): TransactionRow => ({
        id: Number(r.transaction_id), season: r.season, week: r.week, phase: r.phase,
        kind: r.kind, teamId: r.team_id, teamName: r.team_name,
        counterpartyTeamId: r.counterparty_team_id,
        counterpartyTeamName: r.counterparty_team_name,
        playerId: r.player_id, playerName: r.player_name,
        detail: r.detail,
        capImpact: r.cap_impact === null ? null : Number(r.cap_impact),
        mine: r.team_id === save.user_team_id
          || r.counterparty_team_id === save.user_team_id,
      })),
    };
  },
};
