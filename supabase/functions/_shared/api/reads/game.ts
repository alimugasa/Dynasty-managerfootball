// game: one box score.

import { notFound, type Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';

export interface GameIn { readonly saveId: string; readonly gameId: string }

export interface SideOut {
  readonly teamId: string; readonly score: number;
  readonly passYards: number | null; readonly rushYards: number | null;
  readonly firstDowns: number | null; readonly turnovers: number | null;
  readonly sacksAllowed: number | null;
}

export interface LineOut {
  readonly playerId: string; readonly name: string; readonly teamId: string;
  readonly passYards: number; readonly rushYards: number; readonly recYards: number;
}

export interface GameOut {
  readonly gameId: string; readonly week: number; readonly overtime: boolean;
  readonly home: SideOut; readonly away: SideOut;
  readonly lines: readonly LineOut[];
}

export const game: Handler<GameIn, GameOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), gameId: requireString(r, 'gameId') };
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const [g] = await sql<Record<string, number | string | boolean | null>[]>`
      select * from public.game_results where save_id = ${s.id} and game_id = ${input.gameId}`;
    if (g === undefined) throw notFound('game');
    const side = (p: 'home' | 'away'): SideOut => ({
      teamId: String(g[`${p}_team_id`]), score: Number(g[`${p}_score`]),
      passYards: g[`${p}_pass_yards`] as number | null, rushYards: g[`${p}_rush_yards`] as number | null,
      firstDowns: g[`${p}_first_downs`] as number | null, turnovers: g[`${p}_turnovers`] as number | null,
      sacksAllowed: g[`${p}_sacks_allowed`] as number | null,
    });
    const lines = await sql<{
      player_id: string; display_name: string; team_id: string;
      pass_yards: number; rush_yards: number; rec_yards: number;
    }[]>`
      select l.player_id, p.display_name, l.team_id, l.pass_yards, l.rush_yards, l.rec_yards
        from public.player_game_stats l
        join public.players p on p.save_id = l.save_id and p.player_id = l.player_id
       where l.save_id = ${s.id} and l.game_id = ${input.gameId}
         and l.pass_yards + l.rush_yards + l.rec_yards > 0
       order by l.pass_yards + l.rush_yards + l.rec_yards desc, l.player_id limit 8`;
    return {
      gameId: input.gameId, week: Number(g['week']), overtime: Boolean(g['overtime']),
      home: side('home'), away: side('away'),
      lines: lines.map((l) => ({
        playerId: l.player_id, name: l.display_name, teamId: l.team_id,
        passYards: l.pass_yards, rushYards: l.rush_yards, recYards: l.rec_yards,
      })),
    };
  },
};
