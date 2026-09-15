// The Trade Center, in one call.
//
// Everything the header needs before a manager looks at a single name -- what
// week it is, whether trading is open, when it shuts, what the club can spend,
// what it owns in the draft, how many players it has listed -- plus the five
// lists underneath.
//
// One read rather than six, for the same reason every other dashboard here is
// one read: a screen that fires a query per section shows its sections
// arriving one at a time, and this one has six.

import type { Handler } from '../context.ts';
import { ownedSave, seasonWeeks } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { ACTIVE_ROSTER_LIMIT, teamCapPosition, teamRosterCount } from '../rosterSpace.ts';
import { deadlineNotice, deadlineUrgency, tradeWindow } from '../tradeWindow.ts';
import { clubTradeContext } from '../tradeContext.ts';
import { STRATEGY_LABEL, type Strategy } from '../tradeStrategy.ts';
import { INTEREST_LABEL, type Interest } from '../tradeInterest.ts';
import { moraleLabel } from '../tradeMorale.ts';

export interface TradeCenterIn { readonly saveId: string }

export interface BlockPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly overall: number;
  readonly morale: number | null;
  readonly moraleLabel: string;
  readonly note: string | null;
  readonly listedWeek: number | null;
  /** How many clubs have offered for him. */
  readonly offers: number;
}

export interface OwnedPick {
  readonly pickId: string;
  readonly year: number;
  readonly round: number;
  /** The club it originally belonged to, which is what makes a pick worth
   *  more or less than its round suggests. */
  readonly fromTeamId: string;
  readonly fromTeamName: string | null;
  readonly own: boolean;
}

export interface TradeSummary {
  readonly tradeId: number;
  readonly week: number | null;
  readonly fromTeamId: string;
  readonly fromTeamName: string | null;
  readonly toTeamId: string;
  readonly toTeamName: string | null;
  readonly state: string;
  readonly interest: string | null;
  readonly interestLabel: string | null;
  readonly reasons: readonly string[];
  readonly mine: boolean;
  /** What each side sends, as labels a person reads. */
  readonly sending: readonly string[];
  readonly receiving: readonly string[];
}

export interface RivalClub {
  readonly teamId: string;
  readonly name: string;
  readonly strategy: Strategy;
  readonly strategyLabel: string;
  readonly record: string;
  readonly needs: readonly string[];
  readonly capSpace: number;
}

export interface TradeCenterOut {
  readonly season: number;
  readonly week: number;
  readonly seasonWeeks: number;
  readonly phase: string;
  readonly open: boolean;
  readonly deadlineWeek: number;
  readonly weeksLeft: number;
  readonly notice: string | null;
  readonly urgency: string;
  readonly capSpace: number;
  readonly rosterCount: number;
  readonly rosterLimit: number;
  readonly strategy: Strategy;
  readonly strategyLabel: string;
  readonly picks: readonly OwnedPick[];
  readonly block: readonly BlockPlayer[];
  readonly incoming: readonly TradeSummary[];
  readonly proposed: readonly TradeSummary[];
  readonly completed: readonly TradeSummary[];
  readonly leagueActivity: readonly TradeSummary[];
  readonly clubs: readonly RivalClub[];
}

export const tradeCenter: Handler<TradeCenterIn, TradeCenterOut> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: async ({ sql, userId }, input) => {
    const save = await ownedSave(sql, userId, input.saveId);
    const weeks = await seasonWeeks(sql, save.id, save.season);
    const w = tradeWindow(save.phase, save.week, weeks, save.trade_deadline_week);
    const me = await clubTradeContext(
      sql, save.id, save.season, save.week, weeks, save.user_team_id, save.franchise_settings);
    const cap = await teamCapPosition(sql, save.id, save.season, save.user_team_id);

    const picks = await sql<{
      pick_id: string; draft_year: number; round: number;
      original: string; name: string | null;
    }[]>`
      select d.pick_id, d.draft_year, d.round, d.original_team_id as original,
             t.metro_area || ' ' || t.nickname as name
        from public.draft_picks d
        left join public.teams t on t.save_id = d.save_id and t.team_id = d.original_team_id
       where d.save_id = ${save.id} and d.current_owner_team_id = ${save.user_team_id}
         and d.selected_player_id is null
       order by d.draft_year, d.round, d.original_team_id`;

    const block = await sql<{
      player_id: string; display_name: string; position: string; age: number;
      overall_rating: number; morale: number | null; asking_note: string | null;
      listed_week: number | null; offers: string;
    }[]>`
      select b.player_id, p.display_name, p.position, p.age, p.overall_rating,
             p.morale, b.asking_note, b.listed_week,
             (select count(*) from public.trades t
                join public.trade_assets a
                  on a.save_id = t.save_id and a.trade_id = t.trade_id
               where t.save_id = b.save_id and t.state = 'PROPOSED'
                 and t.to_team_id = ${save.user_team_id}
                 and a.player_id = b.player_id)::text as offers
        from public.trade_block b
        join public.players p on p.save_id = b.save_id and p.player_id = b.player_id
       where b.save_id = ${save.id} and b.team_id = ${save.user_team_id}
       order by p.overall_rating desc`;

    const trades = await readTrades(sql, save.id, save.season, save.user_team_id);

    // Every other club, with what it is trying to do written on it. This is
    // the Browse Teams section, and it is the whole reason a manager knows
    // who to call: a rebuilding club with cap room is a different phone call
    // from a contender with none.
    const others = await sql<{ team_id: string }[]>`
      select team_id from public.teams
       where save_id = ${save.id} and team_id <> ${save.user_team_id}
       order by team_id`;
    const clubs: RivalClub[] = [];
    for (const row of others) {
      const club = await clubTradeContext(
        sql, save.id, save.season, save.week, weeks, row.team_id, save.franchise_settings);
      clubs.push({
        teamId: club.teamId, name: club.name,
        strategy: club.strategy, strategyLabel: STRATEGY_LABEL[club.strategy],
        record: `${String(club.record.wins)}-${String(club.record.losses)}`
          + (club.record.ties > 0 ? `-${String(club.record.ties)}` : ''),
        needs: club.needLabels,
        capSpace: club.capSpace,
      });
    }

    return {
      season: save.season, week: save.week, seasonWeeks: weeks, phase: save.phase,
      open: w.open, deadlineWeek: w.deadlineWeek, weeksLeft: w.weeksLeft,
      notice: deadlineNotice(w), urgency: deadlineUrgency(w),
      capSpace: cap.available,
      rosterCount: await teamRosterCount(sql, save.id, save.user_team_id),
      rosterLimit: ACTIVE_ROSTER_LIMIT,
      strategy: me.strategy, strategyLabel: STRATEGY_LABEL[me.strategy],
      picks: picks.map((p): OwnedPick => ({
        pickId: p.pick_id, year: p.draft_year, round: p.round,
        fromTeamId: p.original, fromTeamName: p.name,
        own: p.original === save.user_team_id,
      })),
      block: block.map((b): BlockPlayer => ({
        playerId: b.player_id, name: b.display_name, position: b.position,
        age: b.age, overall: b.overall_rating, morale: b.morale,
        moraleLabel: moraleLabel(b.morale),
        note: b.asking_note, listedWeek: b.listed_week,
        offers: Number(b.offers),
      })),
      incoming: trades.filter((t) => t.state === 'PROPOSED' && t.toTeamId === save.user_team_id),
      proposed: trades.filter((t) => t.state === 'PROPOSED' && t.fromTeamId === save.user_team_id),
      completed: trades.filter((t) => t.state === 'ACCEPTED' && t.mine),
      leagueActivity: trades.filter((t) => t.state === 'ACCEPTED' && !t.mine).slice(0, 20),
      clubs,
    };
  },
};

/** Every trade this season, with its assets written out as labels. */
async function readTrades(
  sql: Parameters<typeof tradeCenter.run>[0]['sql'],
  saveId: string, season: number, userTeamId: string,
): Promise<readonly TradeSummary[]> {
  const rows = await sql<{
    trade_id: string; week: number | null; from_team_id: string; to_team_id: string;
    state: string; interest: string | null; reasons: string[] | null;
    from_name: string | null; to_name: string | null;
  }[]>`
    select t.trade_id::text, t.week, t.from_team_id, t.to_team_id, t.state,
           t.interest, t.reasons,
           a.metro_area || ' ' || a.nickname as from_name,
           b.metro_area || ' ' || b.nickname as to_name
      from public.trades t
      left join public.teams a on a.save_id = t.save_id and a.team_id = t.from_team_id
      left join public.teams b on b.save_id = t.save_id and b.team_id = t.to_team_id
     where t.save_id = ${saveId} and t.season = ${season}
       and t.state in ('PROPOSED', 'ACCEPTED')
     order by t.trade_id desc
     limit 60`;
  if (rows.length === 0) return [];

  const assets = await sql<{
    trade_id: string; from_team_id: string; label: string;
  }[]>`
    select a.trade_id::text, a.from_team_id,
           coalesce(
             p.position || ' ' || p.display_name,
             d.draft_year || ' round ' || d.round) as label
      from public.trade_assets a
      left join public.players p on p.save_id = a.save_id and p.player_id = a.player_id
      left join public.draft_picks d on d.save_id = a.save_id and d.pick_id = a.pick_id
     where a.save_id = ${saveId}
       and a.trade_id = any(${rows.map((r) => Number(r.trade_id))}::bigint[])
     order by a.asset_id`;

  const byTrade = new Map<string, { from: string; label: string }[]>();
  for (const a of assets) {
    const list = byTrade.get(a.trade_id) ?? [];
    list.push({ from: a.from_team_id, label: a.label });
    byTrade.set(a.trade_id, list);
  }

  return rows.map((r): TradeSummary => {
    const list = byTrade.get(r.trade_id) ?? [];
    return {
      tradeId: Number(r.trade_id), week: r.week,
      fromTeamId: r.from_team_id, fromTeamName: r.from_name,
      toTeamId: r.to_team_id, toTeamName: r.to_name,
      state: r.state, interest: r.interest,
      interestLabel: r.interest === null
        ? null : INTEREST_LABEL[r.interest as Interest] ?? r.interest,
      reasons: r.reasons ?? [],
      mine: r.from_team_id === userTeamId || r.to_team_id === userTeamId,
      sending: list.filter((a) => a.from === r.from_team_id).map((a) => a.label),
      receiving: list.filter((a) => a.from === r.to_team_id).map((a) => a.label),
    };
  });
}
