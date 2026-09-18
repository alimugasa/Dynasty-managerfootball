import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { parseSettings } from '../franchiseOptions.ts';
import { isPreseasonPhase, rosterFault, rosterLimits } from '../preseason.ts';
import { depthState } from '../depthState.ts';
import { POSITION_GROUPS, STARTERS } from '../../engine/types.ts';
import type { DepthChartOut, DepthGroupOut, DepthPlayerOut } from './depthChartTypes.ts';
export type { DepthChartOut } from './depthChartTypes.ts';

export const depthChart: Handler<{ readonly saveId: string }, DepthChartOut> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: async ({ sql, userId }, { saveId }) => {
    const save = await ownedSave(sql, userId, saveId);
    const state = await depthState(sql, save);
    const limits = rosterLimits(parseSettings(save.franchise_settings) ?? null);
    const fault = rosterFault(state.players.length, limits);
    const camp = isPreseasonPhase(save.phase);
    const groups: DepthGroupOut[] = POSITION_GROUPS.map((group) => {
      const startingPlaces = STARTERS[group];
      const order: DepthPlayerOut[] = state.chart[group].map((id, index) => {
        const player = state.byId.get(id);
        if (player === undefined) throw new Error(`Missing depth-chart player ${id}.`);
        return {
          playerId: id, name: player.display_name, position: player.position,
          age: player.age, overall: player.overall_rating, rosterStatus: player.roster_status,
          out: state.out.get(id) ?? null, rank: index + 1,
          role: startingPlaces === 0 ? 'Specialist' : index < startingPlaces ? 'Starter'
            : index < startingPlaces * 2 ? 'Backup' : 'Reserve',
          persisted: state.stored[group].includes(id),
        };
      });
      const startersSet = Math.min(order.length, startingPlaces);
      const injuredStarters = order.filter((p) => p.role === 'Starter' && p.out !== null).length;
      const available = order.filter((p) => p.out === null).length;
      const needsSave = JSON.stringify(state.stored[group]) !== JSON.stringify(state.chart[group]);
      const warnings: string[] = [];
      if (startersSet < startingPlaces) warnings.push(`${group}: ${String(startingPlaces - startersSet)} starting places unfilled.`);
      if (available < startingPlaces) warnings.push(`${group}: ${String(available)} available for ${String(startingPlaces)} starting places; the simulation may use out-of-position cover.`);
      else if (available === startingPlaces && startingPlaces > 0) warnings.push(`${group}: no available cover behind the starting unit.`);
      if (injuredStarters > 0) warnings.push(`${group}: ${String(injuredStarters)} injured starter(s). Your saved order is unchanged.`);
      if (group === 'LS' && order.length === 0) warnings.push('No long snapper on the roster.');
      if (needsSave) warnings.push(`${group}: roster changed or order missing. Review and save the displayed simulation order.`);
      return { group, startingPlaces, order, startersSet, injuredStarters, available, needsSave, warnings };
    });
    const competition = save.phase === 'PLAYOFFS' ? 'PLAYOFF' : 'REGULAR';
    const [next] = await sql<{ game_id: string; week: number; opponent_id: string; opponent_name: string;
      home: boolean }[]>`
      select sc.game_id, sc.week, t.team_id as opponent_id,
             t.metro_area || ' ' || t.nickname as opponent_name,
             sc.home_team_id = ${save.user_team_id} as home
        from public.season_schedule sc join public.teams t on t.save_id = sc.save_id
         and t.team_id = case when sc.home_team_id = ${save.user_team_id} then sc.away_team_id else sc.home_team_id end
       where sc.save_id = ${save.id} and sc.season = ${save.season} and sc.competition = ${competition}
         and sc.status = 'SCHEDULED' and sc.week >= ${camp ? 1 : save.week}
         and (sc.home_team_id = ${save.user_team_id} or sc.away_team_id = ${save.user_team_id})
       order by sc.week, sc.game_id limit 1`;
    return {
      revision: state.revision, phase: save.phase, season: save.season, week: save.week,
      rosterCount: state.players.length, rosterTarget: limits.active, countEnforced: limits.enforced,
      rosterFault: fault, blockers: camp && fault !== null ? [fault] : [],
      // Count-only finalization is an existing rule. Warnings never add a gate.
      warnings: [...(!camp && fault !== null ? [`Roster differs from the opening target: ${String(state.players.length)} / ${String(limits.active)}. This does not block the existing weekly simulation.`] : []),
        ...groups.flatMap((g) => g.warnings)],
      groups, chartSaved: groups.every((g) => !g.needsSave),
      startersSet: groups.reduce((n, g) => n + g.startersSet, 0),
      startingPlaces: groups.reduce((n, g) => n + g.startingPlaces, 0),
      injuredStarters: groups.reduce((n, g) => n + g.injuredStarters, 0),
      canFinalize: camp && fault === null,
      action: save.phase === 'FINAL_CUTS' ? 'FINALIZE' : camp ? 'CAMP'
        : save.phase === 'REGULAR_SEASON' || save.phase === 'PLAYOFFS' ? 'PLAY' : 'OFFSEASON',
      nextGame: next === undefined ? null : { gameId: next.game_id, week: next.week,
        opponentId: next.opponent_id, opponentName: next.opponent_name, home: next.home, competition },
    };
  },
};
