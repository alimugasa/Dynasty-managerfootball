import { MissingData, required } from './errors';
import type { LeagueIntelligenceOut } from '../../supabase/functions/_shared/api/reads/leagueIntelligence';
export function requireIntelligence(data: LeagueIntelligenceOut): LeagueIntelligenceOut {
  const ctx = { table: 'league-intelligence', screen: 'league' };
  required(data, ctx); required(data.calendar, ctx);
  required(data.userTeamId, ctx); required(data.calendar.phase, ctx);
  for (const key of ['awardsActive', 'pictureActive', 'lateSeason'] as const) {
    if (typeof data.calendar[key] !== 'boolean') throw new MissingData({ ...ctx, column: key });
  }
  for (const key of ['season', 'weeks', 'throughWeek', 'awardFromWeek', 'pictureFromWeek'] as const) {
    if (!Number.isFinite(data.calendar[key])) throw new MissingData({ ...ctx, column: key });
  }
  if (!Array.isArray(data.rankings) || data.rankings.length === 0
    || data.picture === undefined || data.races === undefined
    || (data.calendar.pictureActive && data.picture === null) || (data.calendar.awardsActive && data.races === null)) throw new MissingData(ctx);
  for (const board of data.rankings) {
    required(board.label, ctx); required(board.unit, ctx); required(board.detail, ctx);
    if (!Array.isArray(board.rows) || board.rows.length === 0) throw new MissingData({ ...ctx, column: board.key });
    for (const row of board.rows) {
      required(row.teamId, ctx); required(row.name, ctx);
      if ((row.rank !== null && !Number.isFinite(row.rank)) || (row.value !== null && !Number.isFinite(row.value))
        || !Number.isFinite(row.games) || (row.games > 0 && (row.rank === null || row.value === null))) throw new MissingData({ ...ctx, id: row.teamId });
    }
  }
  if (data.picture !== null) {
    if (!Array.isArray(data.picture.conferences) || data.picture.conferences.length === 0
      || !Array.isArray(data.picture.tiebreakers) || !Number.isFinite(data.picture.qualifiers)) throw new MissingData({ ...ctx, column: 'picture' });
    for (const c of data.picture.conferences) {
      required(c.id, ctx); required(c.name, ctx);
      if (!Array.isArray(c.teams) || c.teams.length === 0) throw new MissingData({ ...ctx, column: 'conference.teams' });
      for (const t of c.teams) {
        required(t.name, ctx); required(t.teamId, ctx); required(t.status, ctx); required(t.division, ctx);
        if (![t.wins, t.losses, t.ties, t.remaining, t.divisionRank, t.conferenceRank].every(Number.isFinite)
          || (t.seed !== null && !Number.isFinite(t.seed)) || (t.gamesBack !== null && !Number.isFinite(t.gamesBack))) throw new MissingData({ ...ctx, id: t.teamId });
      }
    }
  }
  if (data.races !== null) {
    if (!Array.isArray(data.races) || data.races.length === 0) throw new MissingData({ ...ctx, column: 'races' });
    for (const r of data.races) {
      required(r.code, ctx); required(r.name, ctx);
      if (!Array.isArray(r.candidates)) throw new MissingData({ ...ctx, column: 'candidates' });
      for (const p of r.candidates) {
        required(p.playerId, ctx); required(p.name, ctx); required(p.teamId, ctx); required(p.position, ctx); required(p.evidence, ctx);
        if (![p.index, p.rank, p.games, p.experience].every(Number.isFinite) || p.movement === undefined
          || (p.places !== null && !Number.isFinite(p.places))) throw new MissingData({ ...ctx, id: p.playerId });
      }
    }
  }
  return data;
}
