// recap: a season, when it is over.
//
// The champion, the awards, both all-league teams, the year's leaders, the
// records that fell, and what the club you manage did. One read, because a
// recap is one screen and six round trips to draw it would show it in pieces.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { optionalInt, rawOf, requireString } from '../parse.ts';

export interface RecapIn { readonly saveId: string; readonly season?: number }

export interface AwardOut {
  readonly code: string; readonly name: string;
  readonly winner: string; readonly teamId: string | null;
  readonly playerId: string | null; readonly coachId: string | null;
  readonly voteShare: number | null;
  readonly ballot: readonly { readonly rank: number; readonly name: string; readonly teamId: string | null; readonly voteShare: number | null }[];
}

export interface HonourOut {
  readonly team: string; readonly position: string; readonly slot: number;
  readonly playerId: string | null; readonly name: string; readonly teamId: string | null;
}

export interface RecordOut {
  readonly code: string; readonly name: string; readonly scope: string;
  readonly value: number; readonly holder: string; readonly season: number | null;
  readonly setThisSeason: boolean;
}

export interface RecapOut {
  readonly season: number;
  /** False before the final has been played: there is nothing to recap yet. */
  readonly complete: boolean;
  readonly championTeamId: string | null;
  readonly runnerUpTeamId: string | null;
  readonly awards: readonly AwardOut[];
  readonly honours: readonly HonourOut[];
  readonly records: readonly RecordOut[];
  /** The club you manage: its record, its finish, how far it went. */
  readonly you: {
    readonly teamId: string;
    readonly wins: number; readonly losses: number; readonly ties: number;
    readonly finish: number | null;
    readonly playoffResult: string | null;
    readonly seed: number | null;
  } | null;
  /** Seasons this dynasty has completed, newest first, for the chips. */
  readonly seasons: readonly number[];
}

export const recap: Handler<RecapIn, RecapOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const season = optionalInt(r, 'season');
    return { saveId: requireString(r, 'saveId'), ...(season === undefined ? {} : { season }) };
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const played = (await sql<{ season: number }[]>`
      select distinct season from public.league_history
       where save_id = ${s.id} order by season desc`).map((r) => r.season);
    const season = input.season ?? played[0] ?? s.season;
    const complete = played.includes(season);

    if (!complete) {
      return {
        season, complete: false, championTeamId: null, runnerUpTeamId: null,
        awards: [], honours: [], records: [], you: null, seasons: played,
      };
    }

    const book = await sql<{
      team_id: string; wins: number; losses: number; ties: number;
      playoff_result: string | null; conference_seed: number | null; division_finish: number | null;
    }[]>`
      select team_id, wins, losses, ties, playoff_result, conference_seed, division_finish
        from public.league_history where save_id = ${s.id} and season = ${season}`;
    const awards = await sql<{
      award_code: string; award_name: string; player_name: string | null;
      player_id: string | null; coach_id: string | null; team_abbr: string | null;
      vote_share: string | null;
    }[]>`
      select award_code, award_name, player_name, player_id, coach_id, team_abbr, vote_share::text
        from public.awards where save_id = ${s.id} and season = ${season} order by award_code`;
    const ballots = await sql<{
      award_code: string; finish_rank: number; player_name: string | null;
      team_abbr: string | null; vote_share: string | null;
    }[]>`
      select award_code, finish_rank, player_name, team_abbr, vote_share::text
        from public.award_ballots where save_id = ${s.id} and season = ${season}
       order by award_code, finish_rank`;
    const honours = await sql<{
      honour_type: string; position: string; slot: number;
      player_id: string | null; player_name: string | null; team_abbr: string | null;
    }[]>`
      select honour_type, position, slot, player_id, player_name, team_abbr
        from public.honours where save_id = ${s.id} and season = ${season}
       order by honour_type, position, slot`;
    const records = await sql<{
      record_code: string; record_name: string; scope: string; value: string;
      player_name: string | null; season: number | null; set_at_season: number | null;
    }[]>`
      select record_code, record_name, scope, value::text, player_name, season, set_at_season
        from public.league_records where save_id = ${s.id}
       order by scope, record_code`;

    const mine = book.find((r) => r.team_id === s.user_team_id);
    const num = (value: string | null): number | null => (value === null ? null : Number(value));
    return {
      season,
      complete: true,
      championTeamId: book.find((r) => r.playoff_result === 'CHAMPION')?.team_id ?? null,
      runnerUpTeamId: book.find((r) => r.playoff_result === 'RUNNER_UP')?.team_id ?? null,
      awards: awards.map((a) => ({
        code: a.award_code, name: a.award_name, winner: a.player_name ?? '',
        teamId: a.team_abbr, playerId: a.player_id, coachId: a.coach_id,
        voteShare: num(a.vote_share),
        ballot: ballots.filter((b) => b.award_code === a.award_code).map((b) => ({
          rank: b.finish_rank, name: b.player_name ?? '', teamId: b.team_abbr,
          voteShare: num(b.vote_share),
        })),
      })),
      honours: honours.map((h) => ({
        team: h.honour_type, position: h.position, slot: h.slot,
        playerId: h.player_id, name: h.player_name ?? '', teamId: h.team_abbr,
      })),
      records: records.map((r) => ({
        code: r.record_code, name: r.record_name, scope: r.scope, value: Number(r.value),
        holder: r.player_name ?? '', season: r.season,
        setThisSeason: r.set_at_season === season,
      })),
      you: mine === undefined ? null : {
        teamId: mine.team_id, wins: mine.wins, losses: mine.losses, ties: mine.ties,
        finish: mine.division_finish, playoffResult: mine.playoff_result,
        seed: mine.conference_seed,
      },
      seasons: played,
    };
  },
};
