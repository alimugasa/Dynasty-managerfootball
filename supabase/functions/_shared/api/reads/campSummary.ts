// Read-only presentation of existing rules and fixtures. No phase is changed here.
import type { Db } from '../db.ts';
import type { SaveRow } from '../save.ts';
import { keepsAtGroup } from '../campBoard.ts';
import {
  isPreseasonPhase, nextPreseasonPhase, PRESEASON_ACTION, PRESEASON_LABEL,
} from '../preseason.ts';
import { POSITION_GROUPS, STARTERS } from '../../engine/types.ts';
import type { CampBattleOut, CampFixtureOut, CampPlayerOut, CampProgress } from './campTypes.ts';

export function campProgress(phase: string, week: number, fault: string | null): CampProgress {
  if (!isPreseasonPhase(phase)) return {
    active: false, phaseLabel: phase, nextPhaseLabel: null, deadline: null,
    advanceLabel: null, advanceRoute: null, advanceFault: 'Camp is not active.',
    finalizeFault: 'There is no roster to finalize outside camp.',
  };
  const next = nextPreseasonPhase(phase, week);
  return {
    active: true, phaseLabel: PRESEASON_LABEL[phase],
    nextPhaseLabel: next === 'REGULAR_SEASON' ? 'Regular season' : PRESEASON_LABEL[next],
    deadline: 'Finalize the roster before regular-season week 1.',
    advanceLabel: PRESEASON_ACTION[phase],
    advanceRoute: phase === 'FINAL_CUTS' ? 'finalize-roster' : 'advance-camp',
    advanceFault: phase === 'FINAL_CUTS' ? fault : null,
    // The existing handler permits early sign-off in all three camp phases.
    finalizeFault: fault,
  };
}

export function campGroups(players: readonly CampPlayerOut[], battles: readonly Pick<CampBattleOut, 'group'>[]) {
  return POSITION_GROUPS.map((group) => ({
    group, count: players.filter((p) => p.group === group).length,
    available: players.filter((p) => p.group === group && !p.injured).length,
    startingPlaces: STARTERS[group], projectedPlaces: keepsAtGroup(group),
    battles: battles.filter((b) => b.group === group).length,
  }));
}

/** Existing advisory checks, separate from the count-only finalization gate. */
export function depthWarnings(counts: ReadonlyMap<string, number>): readonly string[] {
  const warnings: string[] = [];
  for (const [group, starters] of Object.entries(STARTERS)) {
    const have = counts.get(group) ?? 0;
    if (starters === 0) {
      if (have === 0) warnings.push('No long snapper on the roster.');
    } else if (have < starters) {
      warnings.push(`${group}: ${String(have)} on the roster for ${String(starters)} starting `
        + `${starters === 1 ? 'place' : 'places'}.`);
    } else if (have === starters && starters >= 2) {
      warnings.push(`${group}: no cover behind the starters.`);
    }
  }
  return warnings;
}

export async function campFixtures(db: Db, save: SaveRow): Promise<readonly CampFixtureOut[]> {
  const rows = await db<{
    game_id: string; week: number; opponent_id: string; opponent_name: string;
    home: boolean; status: string; home_score: number | null; away_score: number | null;
  }[]>`
    select sc.game_id, sc.week, sc.status, (sc.home_team_id = ${save.user_team_id}) as home,
           t.team_id as opponent_id, t.metro_area || ' ' || t.nickname as opponent_name,
           g.home_score, g.away_score
      from public.season_schedule sc
      join public.teams t on t.save_id = sc.save_id
       and t.team_id = case when sc.home_team_id = ${save.user_team_id}
                           then sc.away_team_id else sc.home_team_id end
      left join public.game_results g on g.save_id = sc.save_id and g.game_id = sc.game_id
       and g.competition = 'PRESEASON'
     where sc.save_id = ${save.id} and sc.season = ${save.season}
       and sc.competition = 'PRESEASON'
       and (sc.home_team_id = ${save.user_team_id} or sc.away_team_id = ${save.user_team_id})
     order by sc.week, sc.game_id`;
  return rows.map((r) => {
    const ours = r.home ? r.home_score : r.away_score;
    const theirs = r.home ? r.away_score : r.home_score;
    return {
      gameId: r.game_id, week: r.week, opponentId: r.opponent_id,
      opponentName: r.opponent_name, home: r.home, status: r.status,
      ourScore: ours, theirScore: theirs,
      result: ours === null || theirs === null ? null
        : ours > theirs ? 'W' as const : ours < theirs ? 'L' as const : 'T' as const,
    };
  });
}
