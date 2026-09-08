// The carousel, as rows: coach_history for the season, transactions for the
// moves, and the news the moves make.
//
// coach_history is one row per coach who held a job in the season that just
// ended -- what he did, and what happened to him afterwards. It is written
// once, when the season closes, and never updated: a coach's 2029 is what it
// was, whatever he does in 2030.

import type { Db } from '../db.ts';
import type { CoachMove, CoachRecord, League } from '../../engine/offseason/index.ts';

/** transactions.kind for each kind of move. */
const KIND: Readonly<Record<CoachMove['kind'], string>> = {
  HIRED: 'COACH_HIRE',
  FIRED: 'COACH_FIRE',
  RETIRED: 'COACH_RETIRE',
  PROMOTED: 'COACH_PROMOTE',
  RETAINED: 'COACH_HIRE',
};

/** coach_history.outcome for each kind. A coach who neither moved nor left
 *  was retained, which is a fact about the season and not the absence of one. */
const OUTCOME: Readonly<Record<CoachMove['kind'], string>> = {
  HIRED: 'HIRED', FIRED: 'FIRED', RETIRED: 'RETIRED',
  PROMOTED: 'HIRED', RETAINED: 'RETAINED',
};

const ROLE_LABEL: Readonly<Record<string, string>> = {
  HEAD_COACH: 'head coach',
  OFFENSIVE_COORDINATOR: 'offensive coordinator',
  DEFENSIVE_COORDINATOR: 'defensive coordinator',
  SPECIAL_TEAMS: 'special teams coordinator',
  POSITION_COACH: 'position coach',
};

export interface CoachSeason {
  readonly coachId: string;
  readonly name: string;
  readonly teamId: string | null;
  readonly role: string | null;
  readonly record: CoachRecord | undefined;
  readonly playoffResult: string | null;
  readonly outcome: string;
}

/**
 * Who held which job when the season ended, and what became of them.
 *
 * Taken from the staffs as they were before the carousel ran -- the caller
 * snapshots them -- because after it has run the fired coach has no club and
 * the season's record would attach to nobody.
 */
export function coachSeasons(
  before: readonly { readonly coachId: string; readonly name: string; readonly teamId: string | null; readonly role: string | null }[],
  moves: readonly CoachMove[],
  records: ReadonlyMap<string, CoachRecord>,
  playoffResults: ReadonlyMap<string, string>,
): CoachSeason[] {
  // What happened to him at the club he coached this season. A coach who was
  // fired and hired again the same winter has two moves; the firing is the
  // one this season's row records, because that is what ended this job.
  const ending = new Map<string, CoachMove>();
  for (const move of moves) {
    if (move.kind === 'FIRED' || move.kind === 'RETIRED') ending.set(move.coachId, move);
  }
  const latest = new Map(moves.map((m) => [m.coachId, m]));
  return before.filter((c) => c.teamId !== null).map((c) => {
    const move = ending.get(c.coachId) ?? latest.get(c.coachId);
    return {
      coachId: c.coachId, name: c.name, teamId: c.teamId, role: c.role,
      record: c.teamId === null ? undefined : records.get(c.teamId),
      playoffResult: c.teamId === null ? null : playoffResults.get(c.teamId) ?? null,
      outcome: move === undefined ? 'RETAINED' : OUTCOME[move.kind],
    };
  });
}

export async function writeCoachHistory(
  db: Db, saveId: string, season: number, seasons: readonly CoachSeason[],
): Promise<void> {
  if (seasons.length === 0) return;
  const col = <T>(f: (c: CoachSeason) => T): T[] => seasons.map(f);
  await db`
    insert into public.coach_history (
      save_id, season, coach_id, team_id, coach_name, team_abbr, role,
      wins, losses, ties, playoff_result, outcome)
    select ${saveId}, ${season}, u.coach_id, u.team_id, u.name, u.team_id, u.role,
           u.wins, u.losses, u.ties, u.playoff_result, u.outcome
      from unnest(
        ${col((c) => c.coachId)}::text[], ${col((c) => c.teamId)}::text[],
        ${col((c) => c.name)}::text[],
        ${col((c) => (c.role === null ? null : ROLE_LABEL[c.role] ?? c.role))}::text[],
        ${col((c) => c.record?.wins ?? null)}::int[],
        ${col((c) => c.record?.losses ?? null)}::int[],
        ${col((c) => c.record?.ties ?? null)}::int[],
        ${col((c) => c.playoffResult)}::text[],
        ${col((c) => c.outcome)}::text[]
      ) as u(coach_id, team_id, name, role, wins, losses, ties, playoff_result, outcome)
    on conflict (save_id, season, coach_id) do update
      set team_id = excluded.team_id, role = excluded.role, wins = excluded.wins,
          losses = excluded.losses, ties = excluded.ties,
          playoff_result = excluded.playoff_result, outcome = excluded.outcome`;
}

/** The moves themselves, in the transaction log the Office screen reads. */
export async function logCoachMoves(
  db: Db, saveId: string, season: number, league: League, moves: readonly CoachMove[],
): Promise<number> {
  const logged = moves.filter((m) => m.kind !== 'RETAINED');
  if (logged.length === 0) return 0;
  const col = <T>(f: (m: CoachMove) => T): T[] => logged.map(f);
  const detail = (m: CoachMove): string => {
    const role = m.role === null ? 'staff' : ROLE_LABEL[m.role] ?? m.role;
    if (m.kind === 'FIRED') return `Let go as head coach${m.record === null ? '' : ` after ${m.record}`}`;
    if (m.kind === 'RETIRED') return 'Retired from coaching';
    if (m.kind === 'PROMOTED') return `Promoted to ${role}`;
    return m.fromTeamId === null ? `Hired as ${role}` : `Hired as ${role} from ${m.fromTeamId}`;
  };
  await db`
    insert into public.transactions (
      save_id, season, week, phase, kind, team_id, counterparty_team_id,
      player_id, player_name, team_abbr, detail)
    select ${saveId}, ${season}, null, 'OFFSEASON', u.kind, u.team_id, u.from_team,
           null, u.name, u.team_id, u.detail
      from unnest(
        ${col((m) => KIND[m.kind])}::text[],
        ${col((m) => m.teamId ?? m.fromTeamId)}::text[],
        ${col((m) => (m.fromTeamId === m.teamId ? null : m.fromTeamId))}::text[],
        ${col((m) => m.name)}::text[],
        ${col(detail)}::text[]
      ) as u(kind, team_id, from_team, name, detail)`;
  // The league is passed so a caller cannot log a move for a coach the league
  // does not hold; a mismatch is a defect, not a row to write.
  const known = new Set(league.coaches.map((c) => c.id));
  for (const move of logged) {
    if (move.kind !== 'RETIRED' && !known.has(move.coachId)) {
      throw new Error(`Coach move names ${move.coachId}, who is not in the league`);
    }
  }
  return logged.length;
}
