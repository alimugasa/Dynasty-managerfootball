// The table, recomputed from the results.
//
// A full recompute for one season, not an increment. 272 rows is nothing to
// read, and a table that is always a function of game_results cannot drift
// from it -- which an increment can, the first time a week is replayed.

import type { Db } from '../db.ts';

export interface Standing {
  readonly teamId: string;
  wins: number; losses: number; ties: number;
  pointsFor: number; pointsAgainst: number;
  /** Positive for a winning run, negative for a losing one, 0 for none. */
  streak: number;
  divisionWins: number; divisionLosses: number; divisionTies: number;
  conferenceWins: number; conferenceLosses: number; conferenceTies: number;
}

interface ResultRow {
  week: number; home_team_id: string; away_team_id: string;
  home_score: number; away_score: number;
}

interface TeamRow { team_id: string; division_id: string; conference_id: string }

const streakText = (n: number): string | null =>
  n === 0 ? null : (n > 0 ? `W${String(n)}` : `L${String(-n)}`);

export function parseStreak(text: string | null): number {
  if (text === null || text === '') return 0;
  const n = Number(text.slice(1));
  return text.startsWith('L') ? -n : n;
}

export async function recomputeStandings(
  db: Db, saveId: string, season: number,
): Promise<Map<string, Standing>> {
  const teams = await db<TeamRow[]>`
    select team_id, division_id, conference_id from public.teams
     where save_id = ${saveId} order by team_id`;
  const results = await db<ResultRow[]>`
    select week, home_team_id, away_team_id, home_score, away_score
      from public.game_results
     where save_id = ${saveId} and season = ${season} and competition = 'REGULAR'
     order by week, game_id`;

  const byTeam = new Map<string, TeamRow>(teams.map((t) => [t.team_id, t]));
  const table = new Map<string, Standing>(teams.map((t) => [t.team_id, {
    teamId: t.team_id, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, streak: 0,
    divisionWins: 0, divisionLosses: 0, divisionTies: 0,
    conferenceWins: 0, conferenceLosses: 0, conferenceTies: 0,
  }]));

  for (const g of results) {
    const home = table.get(g.home_team_id);
    const away = table.get(g.away_team_id);
    const homeRow = byTeam.get(g.home_team_id);
    const awayRow = byTeam.get(g.away_team_id);
    if (home === undefined || away === undefined || homeRow === undefined || awayRow === undefined) {
      throw new Error(`game_results names a club not in teams: ${g.home_team_id} v ${g.away_team_id}`);
    }
    home.pointsFor += g.home_score; home.pointsAgainst += g.away_score;
    away.pointsFor += g.away_score; away.pointsAgainst += g.home_score;
    const sameDivision = homeRow.division_id === awayRow.division_id;
    const sameConference = homeRow.conference_id === awayRow.conference_id;

    const credit = (s: Standing, outcome: 'win' | 'loss' | 'tie'): void => {
      if (outcome === 'win') { s.wins += 1; s.streak = s.streak > 0 ? s.streak + 1 : 1; }
      if (outcome === 'loss') { s.losses += 1; s.streak = s.streak < 0 ? s.streak - 1 : -1; }
      if (outcome === 'tie') { s.ties += 1; s.streak = 0; }
      if (sameDivision) {
        if (outcome === 'win') s.divisionWins += 1;
        if (outcome === 'loss') s.divisionLosses += 1;
        if (outcome === 'tie') s.divisionTies += 1;
      }
      if (sameConference) {
        if (outcome === 'win') s.conferenceWins += 1;
        if (outcome === 'loss') s.conferenceLosses += 1;
        if (outcome === 'tie') s.conferenceTies += 1;
      }
    };
    if (g.home_score === g.away_score) { credit(home, 'tie'); credit(away, 'tie'); }
    else if (g.home_score > g.away_score) { credit(home, 'win'); credit(away, 'loss'); }
    else { credit(home, 'loss'); credit(away, 'win'); }
  }

  const rows = [...table.values()];
  await db`
    insert into public.standings (
      save_id, season, team_id, wins, losses, ties, win_pct, points_for, points_against,
      division_wins, division_losses, division_ties,
      conference_wins, conference_losses, conference_ties, streak)
    select ${saveId}, ${season}, u.team_id, u.wins, u.losses, u.ties,
           case when u.wins + u.losses + u.ties = 0 then 0
                else round((u.wins + u.ties / 2.0) / (u.wins + u.losses + u.ties), 3) end,
           u.pf, u.pa, u.dw, u.dl, u.dt, u.cw, u.cl, u.ct, u.streak
      from unnest(
        ${rows.map((s) => s.teamId)}::text[],
        ${rows.map((s) => s.wins)}::int[], ${rows.map((s) => s.losses)}::int[],
        ${rows.map((s) => s.ties)}::int[],
        ${rows.map((s) => s.pointsFor)}::int[], ${rows.map((s) => s.pointsAgainst)}::int[],
        ${rows.map((s) => s.divisionWins)}::int[], ${rows.map((s) => s.divisionLosses)}::int[],
        ${rows.map((s) => s.divisionTies)}::int[],
        ${rows.map((s) => s.conferenceWins)}::int[], ${rows.map((s) => s.conferenceLosses)}::int[],
        ${rows.map((s) => s.conferenceTies)}::int[],
        ${rows.map((s) => streakText(s.streak))}::text[]
      ) as u(team_id, wins, losses, ties, pf, pa, dw, dl, dt, cw, cl, ct, streak)
    on conflict (save_id, season, team_id) do update
      set wins = excluded.wins, losses = excluded.losses, ties = excluded.ties,
          win_pct = excluded.win_pct, points_for = excluded.points_for,
          points_against = excluded.points_against,
          division_wins = excluded.division_wins, division_losses = excluded.division_losses,
          division_ties = excluded.division_ties,
          conference_wins = excluded.conference_wins,
          conference_losses = excluded.conference_losses,
          conference_ties = excluded.conference_ties, streak = excluded.streak`;

  return table;
}
