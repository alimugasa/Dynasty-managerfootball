// player: one profile, this season's line, the deal.

import { notFound, type Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { moraleLabel } from '../tradeMorale.ts';
import { GROUP_OF } from '../../engine/careerWorld.ts';

export interface PlayerIn { readonly saveId: string; readonly playerId: string }

export interface PlayerOut {
  readonly playerId: string; readonly name: string; readonly position: string;
  readonly group: string; readonly teamId: string | null;
  readonly age: number; readonly experience: number;
  readonly overall: number; readonly potential: number;
  readonly durability: number | null;
  readonly season: {
    readonly games: number; readonly passYards: number; readonly rushYards: number;
    readonly recYards: number; readonly tackles: number;
  } | null;
  readonly contract: { readonly aav: number; readonly yearsRemaining: number } | null;
  /** Whether this player is on the managed club's roster, which is what
   *  decides whether the trade block is a thing that can be done to him. */
  readonly mine: boolean;
  readonly onTradeBlock: boolean;
  /** Null until something this game models has moved it. Never a default. */
  readonly morale: number | null;
  readonly moraleLabel: string;
}

export const player: Handler<PlayerIn, PlayerOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), playerId: requireString(r, 'playerId') };
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const [p] = await sql<{
      display_name: string; position: string; team_id: string | null; age: number;
      experience_years: number; overall_rating: number; potential_rating: number;
      durability: number | null;
    }[]>`
      select p.display_name, p.position, r.team_id, p.age, p.experience_years,
             p.overall_rating, p.potential_rating, a.durability
        from public.players p
        left join public.team_rosters r on r.save_id = p.save_id and r.player_id = p.player_id
        left join public.player_attributes a on a.save_id = p.save_id and a.player_id = p.player_id
       where p.save_id = ${s.id} and p.player_id = ${input.playerId}`;
    if (p === undefined) throw notFound('player');
    const [line] = await sql<{ games_played: number; pass_yards: number; rush_yards: number; rec_yards: number; tackles: number }[]>`
      select games_played, pass_yards, rush_yards, rec_yards, tackles
        from public.player_season_stats
       where save_id = ${s.id} and season = ${s.season} and competition = 'REGULAR'
         and player_id = ${input.playerId}`;
    const [extra] = await sql<{ morale: number | null; blocked: boolean }[]>`
      select p.morale, (b.player_id is not null) as blocked
        from public.players p
        left join public.trade_block b
          on b.save_id = p.save_id and b.player_id = p.player_id
       where p.save_id = ${s.id} and p.player_id = ${input.playerId}`;
    const [deal] = await sql<{ average_annual_value: string; years_remaining: number }[]>`
      select average_annual_value::text, years_remaining from public.player_contracts
       where save_id = ${s.id} and player_id = ${input.playerId} and contract_status = 'ACTIVE'
       order by end_year desc limit 1`;
    return {
      playerId: input.playerId, name: p.display_name, position: p.position,
      group: GROUP_OF[p.position] ?? p.position, teamId: p.team_id,
      age: p.age, experience: p.experience_years,
      overall: p.overall_rating, potential: p.potential_rating, durability: p.durability,
      mine: p.team_id === s.user_team_id,
      onTradeBlock: extra?.blocked ?? false,
      morale: extra?.morale ?? null,
      moraleLabel: moraleLabel(extra?.morale ?? null),
      season: line === undefined ? null : {
        games: line.games_played, passYards: line.pass_yards, rushYards: line.rush_yards,
        recYards: line.rec_yards, tackles: line.tackles,
      },
      contract: deal === undefined ? null : {
        aav: Number(deal.average_annual_value), yearsRemaining: deal.years_remaining,
      },
    };
  },
};
