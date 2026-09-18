// The training camp dashboard, in one call.
//
// Everything the camp screen draws: where the phase is, what the roster is
// against what it has to be, and the six lists a manager works through in
// August. One read rather than seven, for the same reason the franchise
// dashboard is one read -- a screen that fires a query per section shows its
// sections arriving one at a time.
//
// Every list here is a different cut of the same board, so the board is built
// once and sliced. That also means the six lists cannot disagree: the man on
// the bubble and the man in the battle are the same row.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { parseSettings } from '../franchiseOptions.ts';
import {
  campBattles, rosterProbability, rosterStatus, STATUS_LABEL,
  type CampBattle, type CampContender,
} from '../campBoard.ts';
import { specialTeamsValue } from '../campEvaluation.ts';
import { cutsRemaining, rosterLimits, rosterFault, PRESEASON_WEEKS } from '../preseason.ts';
import { MAX_DEAD_MONEY_SHARE } from '../../engine/offseason/contracts.ts';
import { POSITION_GROUPS, type PositionGroup } from '../../engine/types.ts';
import { GROUP_OF } from '../../engine/careerWorld.ts';

import type { CampIn, CampOut, CampPlayerOut, CampBattleOut } from './campTypes.ts';
import { campFixtures, campGroups, campProgress, depthWarnings } from './campSummary.ts';
export type { CampIn, CampOut, CampPlayerOut, CampBattleOut } from './campTypes.ts';
export { depthWarnings } from './campSummary.ts';

interface BoardRow {
  player_id: string; display_name: string; position: string; position_group: string;
  overall_rating: number; potential_rating: number; age: number;
  experience_years: number; draft_round: number | null;
  aav: string | null; guaranteed: string | null;
  years_total: number | null; years_remaining: number | null;
  depth_order: number | null; weeks_out: number | null;
  practice_grade: number | null; preseason_grade: number | null;
  preseason_games: number | null; grade_delta: number | null;
}

export const camp: Handler<CampIn, CampOut> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const limits = rosterLimits(parseSettings(s.franchise_settings) ?? null);

    const [rows, cap, fixture, fixtures] = await Promise.all([
      sql<BoardRow[]>`
        -- One row per player. The roster count the whole phase turns on is
        -- this list's length, so a duplicate here would not merely repeat a
        -- card -- it would tell a manager they had more players than they do.
        select distinct on (r.player_id)
               r.player_id, p.display_name, p.position, p.position_group,
               p.overall_rating, p.potential_rating, p.age, p.experience_years,
               p.draft_round,
               c.average_annual_value::text as aav, c.guaranteed_money::text as guaranteed,
               c.years_total, c.years_remaining,
               d.depth_order,
               case when i.player_id is null then null
                    else i.injured_week + i.weeks_out_estimate - ${s.week} end as weeks_out,
               e.practice_grade, e.preseason_grade, e.preseason_games, e.grade_delta
          from public.team_rosters r
          join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
          left join public.player_contracts c
            on c.save_id = r.save_id and c.player_id = r.player_id
           and c.contract_status = 'ACTIVE'
          -- The chart's slot is the engine's position group ('OL'), not the
          -- seed's display grouping ('O-Line'). Joining on the latter matched
          -- nothing and left every player at depth 99, so no player was ever
          -- in a battle and nobody was ever on the bubble.
          left join public.team_depth_charts d
            on d.save_id = r.save_id and d.player_id = r.player_id
           and d.slot = any(${[...POSITION_GROUPS]}::text[])
          left join public.player_injuries i
            on i.save_id = r.save_id and i.player_id = r.player_id
           and i.injured_season = ${s.season}
          left join public.camp_evaluations e
            on e.save_id = r.save_id and e.player_id = r.player_id and e.season = ${s.season}
         where r.save_id = ${s.id} and r.team_id = ${s.user_team_id}
         order by r.player_id, coalesce(d.depth_order, 99)`,
      sql<{ available: string }[]>`
        select available::text from public.salary_cap
         where save_id = ${s.id} and team_id = ${s.user_team_id} and season = ${s.season}`,
      sql<{ week: number; home_team_id: string; away_team_id: string; name: string }[]>`
        select sc.week, sc.home_team_id, sc.away_team_id,
               t.metro_area || ' ' || t.nickname as name
          from public.season_schedule sc
          join public.teams t
            on t.save_id = sc.save_id
           and t.team_id = case when sc.home_team_id = ${s.user_team_id}
                                then sc.away_team_id else sc.home_team_id end
         where sc.save_id = ${s.id} and sc.season = ${s.season}
           and sc.competition = 'PRESEASON' and sc.status = 'SCHEDULED'
           and (sc.home_team_id = ${s.user_team_id} or sc.away_team_id = ${s.user_team_id})
         order by sc.week limit 1`,
      campFixtures(sql, s),
    ]);

    // How many the club carries at each position, which is what makes a fourth
    // receiver a bubble player and a second kicker unemployed.
    const groupOf = (position: string): PositionGroup => GROUP_OF[position] ?? 'LS';
    const groupSize = new Map<string, number>();
    for (const r of rows) {
      const g = groupOf(r.position);
      groupSize.set(g, (groupSize.get(g) ?? 0) + 1);
    }

    const board: CampPlayerOut[] = rows.map((r) => {
      const group = groupOf(r.position);
      const capHit = r.aav === null ? null : Number(r.aav);
      const knownContract = capHit !== null && r.guaranteed !== null
        && r.years_total !== null && r.years_total > 0 && r.years_remaining !== null;
      const share = !knownContract ? null : Math.max(0, Math.min(1,
        1 - (Number(r.years_total) - Number(r.years_remaining)) / Number(r.years_total)));
      const deadMoney = share === null ? null : Math.round(Math.min(
        Number(r.guaranteed) * share,
        Number(capHit) * MAX_DEAD_MONEY_SHARE));
      const weeksOut = r.weeks_out !== null && r.weeks_out > 0 ? r.weeks_out : null;
      const depth = r.depth_order ?? 99;
      const specialTeams = specialTeamsValue({
        position: group, age: r.age,
        experience_years: r.experience_years, depth_order: r.depth_order,
      });
      // The read falls back to deriving a practice grade when camp has not
      // written one yet -- a save opened mid-camp by an older build, or the
      // first render before the first evaluation lands.
      const practiceGrade = r.practice_grade ?? Math.round(Math.max(0, Math.min(100,
        50 + (r.overall_rating - 68) * 1.6
        + Math.max(0, r.potential_rating - r.overall_rating) * 0.8)));

      const player = {
        playerId: r.player_id, name: r.display_name, group,
        overall: r.overall_rating, potential: r.potential_rating,
        age: r.age, experienceYears: r.experience_years,
        capHit, deadMoney, draftRound: r.draft_round,
        rookie: r.experience_years === 0,
        depth, groupSize: groupSize.get(group) ?? 0,
        specialTeams, schemeFit: 50,
        injured: weeksOut !== null,
        practiceGrade,
        preseasonGrade: r.preseason_grade,
      };
      // Missing contract inputs cannot mean a free player or a zero cut charge.
      const priced = capHit === null || deadMoney === null ? null : { ...player, capHit, deadMoney };
      const probability = priced === null ? null : rosterProbability(priced);
      const status = priced === null || probability === null ? null : rosterStatus(priced, probability);
      return {
        ...player,
        position: r.position,
        group,
        weeksOut, contractYears: r.years_remaining, depthOrder: r.depth_order,
        practiceSource: r.practice_grade === null ? 'INITIAL_ESTIMATE' : 'RECORDED',
        preseasonBasis: ['OL', 'K', 'P', 'LS'].includes(group) ? 'AVAILABILITY' : 'PRODUCTION',
        trend: r.preseason_grade === null ? 'UNSEEN'
          : (r.grade_delta !== null && r.grade_delta >= 6) ? 'RISER'
            : (r.grade_delta !== null && r.grade_delta <= -6) ? 'FALLER' : 'STEADY',
        preseasonGames: r.preseason_games ?? 0,
        probability,
        status,
        statusLabel: status === null ? null : STATUS_LABEL[status],
        gradeDelta: r.grade_delta ?? 0,
      };
    });

    const contenders: CampContender[] = board.flatMap((p) =>
      p.capHit === null || p.deadMoney === null || p.probability === null || p.status === null
        ? [] : [{ ...p, capHit: p.capHit, deadMoney: p.deadMoney,
          probability: p.probability, status: p.status, group: p.group as PositionGroup }]);
    const battles = campBattles(contenders);
    const rosterCount = board.length;
    const capSpace = cap[0] === undefined ? null : Number(cap[0].available);
    const next = fixture[0];
    const groups = campGroups(board, battles);

    return {
      players: board,
      groups,
      depthWarnings: depthWarnings(new Map(groups.map((g) => [g.group, g.count]))),
      availabilityWarnings: depthWarnings(new Map(groups.map((g) => [g.group, g.available]))),
      fixtures,
      preseasonRecord: {
        wins: fixtures.filter((f) => f.result === 'W').length,
        losses: fixtures.filter((f) => f.result === 'L').length,
        ties: fixtures.filter((f) => f.result === 'T').length,
      },
      progress: campProgress(s.phase, s.week, rosterFault(rosterCount, limits)),
      phase: s.phase,
      season: s.season,
      preseasonWeek: s.phase === 'PRESEASON' ? s.week : null,
      preseasonWeeks: PRESEASON_WEEKS,
      rosterCount,
      rosterLimit: limits.active,
      campLimit: limits.camp,
      limitEnforced: limits.enforced,
      cutsRemaining: cutsRemaining(rosterCount, limits),
      rosterFault: rosterFault(rosterCount, limits),
      capSpace,
      injuredCount: board.filter((p) => p.injured).length,
      battleCount: battles.length,
      nextOpponentId: next === undefined
        ? null
        : (next.home_team_id === s.user_team_id ? next.away_team_id : next.home_team_id),
      nextOpponentName: next?.name ?? null,
      nextPreseasonWeek: next?.week ?? null,
      battles: battles.map((b: CampBattle): CampBattleOut => ({
        group: b.group, forDepth: b.forDepth, starting: b.starting,
        closeness: b.closeness,
        players: b.players.map((c) => board.find((p) => p.playerId === c.playerId))
          .filter((p): p is CampPlayerOut => p !== undefined),
      })),
      // The bubble is the men the decision is actually about: not the locks,
      // not the ones already beaten.
      bubble: board.filter((p) => p.status === 'BUBBLE' || p.status === 'LONG_SHOT')
        .sort((a, b) => a.probability === null ? (b.probability === null ? 0 : 1) : b.probability === null ? -1 : b.probability - a.probability).slice(0, 12),
      rookies: board.filter((p) => p.rookie)
        .sort((a, b) => a.probability === null ? (b.probability === null ? 0 : 1) : b.probability === null ? -1 : b.probability - a.probability),
      // A veteran at risk is the expensive problem: old or costly, and not
      // safe. Sorted by what he costs, because that is the order a manager
      // would work through them in.
      veteransAtRisk: board
        .filter((p) => !p.rookie && p.probability !== null && p.probability < 70
          && (p.age >= 30 || (p.capHit !== null && p.capHit >= 3_000_000)))
        .sort((a, b) => a.capHit === null ? (b.capHit === null ? 0 : 1) : b.capHit === null ? -1 : b.capHit - a.capHit).slice(0, 10),
      injuries: board.filter((p) => p.injured)
        .sort((a, b) => (b.weeksOut ?? 0) - (a.weeksOut ?? 0)),
      // Who camp has changed its mind about, either way. Only players who
      // have actually played: a delta of zero is not a mover.
      movers: board.filter((p) => p.trend === 'RISER' || p.trend === 'FALLER')
        .sort((a, b) => Math.abs(b.gradeDelta) - Math.abs(a.gradeDelta)).slice(0, 10),
    };
  },
};
