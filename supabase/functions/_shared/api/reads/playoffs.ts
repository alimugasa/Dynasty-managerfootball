// playoffs: the seeds, the bracket so far, and the champion.
//
// Read from rows the week runner wrote -- the seeds on standings, the
// fixtures and results on the schedule -- and nothing derived here that the
// engine did not already decide. Before the regular season ends there are no
// seeds, and the screen says so.

import type { Handler } from '../context.ts';
import { ownedSave, seasonWeeks } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { PLAYOFF_ROUNDS, ROUND_LABEL, type PlayoffRound } from '../../engine/playoffs.ts';
import { PLAYOFF_WEEKS } from '../postseason.ts';

export interface PlayoffsIn { readonly saveId: string }

export interface SeedOut {
  readonly teamId: string; readonly conferenceId: string; readonly seed: number;
  readonly divisionWinner: boolean;
  readonly wins: number; readonly losses: number; readonly ties: number;
}

export interface PlayoffGameOut {
  readonly gameId: string; readonly week: number; readonly round: PlayoffRound;
  readonly label: string; readonly neutralSite: boolean;
  readonly homeTeamId: string; readonly awayTeamId: string;
  readonly homeScore: number | null; readonly awayScore: number | null;
}

export interface PlayoffsOut {
  /** False until the regular season has ended. */
  readonly seeded: boolean;
  readonly seeds: readonly SeedOut[];
  readonly games: readonly PlayoffGameOut[];
  /** The round the next sim-week plays, or null when the bracket is done. */
  readonly nextRound: PlayoffRound | null;
  readonly nextLabel: string | null;
  readonly champion: string | null;
  readonly runnerUp: string | null;
  readonly rounds: readonly { readonly round: PlayoffRound; readonly label: string }[];
  /** The first playoff week and the last, for the schedule's chips. */
  readonly firstWeek: number;
  readonly lastWeek: number;
}

export const playoffs: Handler<PlayoffsIn, PlayoffsOut> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const weeks = await seasonWeeks(sql, s.id, s.season);
    const seeds = await sql<{
      team_id: string; conference_id: string; conference_seed: number; playoff_status: string | null;
      wins: number; losses: number; ties: number;
    }[]>`
      select st.team_id, t.conference_id, st.conference_seed, st.playoff_status,
             st.wins, st.losses, st.ties
        from public.standings st
        join public.teams t on t.save_id = st.save_id and t.team_id = st.team_id
       where st.save_id = ${s.id} and st.season = ${s.season} and st.conference_seed is not null
       order by t.conference_id, st.conference_seed`;
    const games = await sql<{
      game_id: string; week: number; playoff_round: string; neutral_site: boolean;
      home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null;
    }[]>`
      select f.game_id, f.week, f.playoff_round, f.neutral_site, f.home_team_id, f.away_team_id,
             g.home_score, g.away_score
        from public.season_schedule f
        left join public.game_results g on g.save_id = f.save_id and g.game_id = f.game_id
       where f.save_id = ${s.id} and f.season = ${s.season} and f.competition = 'PLAYOFF'
       order by f.week, f.game_id`;

    const roundOf = (name: string): PlayoffRound => {
      const round = PLAYOFF_ROUNDS.find((r) => r === name);
      if (round === undefined) throw new Error(`A playoff game carries an unknown round: ${name}`);
      return round;
    };
    const final = games.find((g) => g.playoff_round === 'LEAGUE_FINAL' && g.home_score !== null && g.away_score !== null);
    const champion = final === undefined ? null
      : ((final.home_score ?? 0) > (final.away_score ?? 0) ? final.home_team_id : final.away_team_id);
    const runnerUp = final === undefined ? null
      : (champion === final.home_team_id ? final.away_team_id : final.home_team_id);
    const pending = games.find((g) => g.home_score === null);
    const nextRound = pending === undefined ? null : roundOf(pending.playoff_round);

    return {
      seeded: seeds.length > 0,
      seeds: seeds.map((r) => ({
        teamId: r.team_id, conferenceId: r.conference_id, seed: r.conference_seed,
        divisionWinner: r.playoff_status === 'CLINCHED_DIVISION' || r.playoff_status === 'CLINCHED_BYE',
        wins: r.wins, losses: r.losses, ties: r.ties,
      })),
      games: games.map((g) => {
        const round = roundOf(g.playoff_round);
        return {
          gameId: g.game_id, week: g.week, round, label: ROUND_LABEL[round], neutralSite: g.neutral_site,
          homeTeamId: g.home_team_id, awayTeamId: g.away_team_id,
          homeScore: g.home_score, awayScore: g.away_score,
        };
      }),
      nextRound, nextLabel: nextRound === null ? null : ROUND_LABEL[nextRound],
      champion, runnerUp,
      rounds: PLAYOFF_ROUNDS.map((round) => ({ round, label: ROUND_LABEL[round] })),
      firstWeek: weeks + 1, lastWeek: weeks + PLAYOFF_WEEKS,
    };
  },
};
