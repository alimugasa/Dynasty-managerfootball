// What a club has to trade, priced.
//
// The package builder opens this on whichever club a manager is talking to,
// and on their own. Both sides come back the same shape so the builder is one
// component rather than two -- a trade is symmetrical and the screen should
// be too.
//
// Values are the *other* club's valuation where the club being browsed is
// theirs, because that is the number that decides the deal. A screen showing
// the manager their own opinion of the other club's player would be showing
// them the wrong number in the one place it matters.

import type { Handler } from '../context.ts';
import { ownedSave, seasonWeeks } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { valueAssets, type AssetRef } from '../tradeAssets.ts';
import { untouchables } from '../tradeContext.ts';
import { strategyFor } from '../tradeStrategy.ts';
import { moraleLabel } from '../tradeMorale.ts';

export interface TradeAssetsIn {
  readonly saveId: string;
  readonly teamId: string;
}

export interface TradablePlayer {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly group: string | null;
  readonly age: number;
  readonly overall: number;
  readonly potential: number;
  readonly salary: number;
  readonly yearsRemaining: number | null;
  readonly morale: number | null;
  readonly moraleLabel: string;
  readonly onBlock: boolean;
  readonly value: number;
  /** Set where this club will not trade him at any price. */
  readonly untouchable: boolean;
}

export interface TradablePick {
  readonly pickId: string;
  readonly year: number;
  readonly round: number;
  readonly fromTeamName: string | null;
  readonly value: number;
}

export interface TradeAssetsOut {
  readonly teamId: string;
  readonly name: string;
  readonly players: readonly TradablePlayer[];
  readonly picks: readonly TradablePick[];
}

export const tradeAssets: Handler<TradeAssetsIn, TradeAssetsOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), teamId: requireString(r, 'teamId') };
  },
  run: async ({ sql, userId }, input) => {
    const save = await ownedSave(sql, userId, input.saveId);
    const [team] = await sql<{ metro_area: string; nickname: string }[]>`
      select metro_area, nickname from public.teams
       where save_id = ${save.id} and team_id = ${input.teamId}`;

    const players = await sql<{
      player_id: string; display_name: string; position: string; age: number;
      overall_rating: number; potential_rating: number; morale: number | null;
      aav: string | null; years_remaining: number | null; blocked: boolean;
    }[]>`
      select p.player_id, p.display_name, p.position, p.age,
             p.overall_rating, p.potential_rating, p.morale,
             c.average_annual_value::text as aav, c.years_remaining,
             (b.player_id is not null) as blocked
        from public.team_rosters r
        join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
        left join public.player_contracts c
          on c.save_id = r.save_id and c.player_id = r.player_id
         and c.contract_status = 'ACTIVE'
        left join public.trade_block b
          on b.save_id = r.save_id and b.player_id = r.player_id
       where r.save_id = ${save.id} and r.team_id = ${input.teamId}
       order by p.overall_rating desc
       limit 60`;

    const picks = await sql<{
      pick_id: string; draft_year: number; round: number; name: string | null;
    }[]>`
      select d.pick_id, d.draft_year, d.round,
             t.metro_area || ' ' || t.nickname as name
        from public.draft_picks d
        left join public.teams t on t.save_id = d.save_id and t.team_id = d.original_team_id
       where d.save_id = ${save.id} and d.current_owner_team_id = ${input.teamId}
         and d.selected_player_id is null
       order by d.draft_year, d.round`;

    // Priced for the club that would be receiving them, which is the other
    // side of the table from wherever these assets currently sit.
    const buyer = input.teamId === save.user_team_id ? null : save.user_team_id;
    const refs: AssetRef[] = [
      ...players.map((p): AssetRef => ({ kind: 'PLAYER', id: p.player_id })),
      ...picks.map((p): AssetRef => ({ kind: 'PICK', id: p.pick_id })),
    ];
    const priced = await valueAssets(
      sql, save.id, save.season, refs, buyer ?? save.user_team_id);
    const valueOf = new Map(priced.map((a) => [a.id, a.value]));

    // Who this club will not part with. Read through the same function the
    // evaluation uses, so the screen cannot mark a player available that the
    // evaluation then refuses.
    const [standing] = await sql<{ wins: number; losses: number; ties: number }[]>`
      select wins, losses, ties from public.standings
       where save_id = ${save.id} and season = ${save.season} and team_id = ${input.teamId}`;
    const [shape] = await sql<{ age: string | null; mine: string | null; league: string | null }[]>`
      select
        (select avg(p.age) from public.team_rosters r
           join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
          where r.save_id = ${save.id} and r.team_id = ${input.teamId})::text as age,
        (select avg(p.overall_rating) from public.team_rosters r
           join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
          where r.save_id = ${save.id} and r.team_id = ${input.teamId})::text as mine,
        (select avg(p.overall_rating) from public.team_rosters r
           join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
          where r.save_id = ${save.id})::text as league`;
    const strategy = strategyFor({
      wins: standing?.wins ?? 0, losses: standing?.losses ?? 0, ties: standing?.ties ?? 0,
      ratingEdge: Number(shape?.mine ?? 0) - Number(shape?.league ?? 0),
      averageAge: Number(shape?.age ?? 26),
      week: save.week,
      // Read from the schedule rather than assumed: a franchise played under
      // a different season length would otherwise have every club's strategy
      // computed against a season it is not playing.
      seasonWeeks: await seasonWeeks(sql, save.id, save.season),
    });
    const locked = await untouchables(sql, save.id, input.teamId, strategy);

    return {
      teamId: input.teamId,
      name: team === undefined ? input.teamId : `${team.metro_area} ${team.nickname}`,
      players: players.map((p): TradablePlayer => ({
        playerId: p.player_id, name: p.display_name, position: p.position,
        group: null, age: p.age,
        overall: p.overall_rating, potential: p.potential_rating,
        salary: Number(p.aav ?? 0),
        yearsRemaining: p.years_remaining,
        morale: p.morale, moraleLabel: moraleLabel(p.morale),
        onBlock: p.blocked,
        value: valueOf.get(p.player_id) ?? 0,
        untouchable: locked.has(p.player_id),
      })),
      picks: picks.map((p): TradablePick => ({
        pickId: p.pick_id, year: p.draft_year, round: p.round,
        fromTeamName: p.name, value: valueOf.get(p.pick_id) ?? 0,
      })),
    };
  },
};
