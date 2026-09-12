// player: one profile, this season's line, the deal.

import { notFound, type Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
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
    const [deal] = await sql<{ average_annual_value: string; years_remaining: number }[]>`
      select average_annual_value::text, years_remaining from public.player_contracts
       where save_id = ${s.id} and player_id = ${input.playerId} and contract_status = 'ACTIVE'
       order by end_year desc limit 1`;
    return {
      playerId: input.playerId, name: p.display_name, position: p.position,
      group: GROUP_OF[p.position] ?? p.position, teamId: p.team_id,
      age: p.age, experience: p.experience_years,
      overall: p.overall_rating, potential: p.potential_rating, durability: p.durability,
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
