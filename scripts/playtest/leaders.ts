// The league read, in the page.
//
// Builds exactly what supabase/functions/_shared/api/reads/league.ts returns --
// the same table rows, the same twelve boards in the same order, the same
// competition split -- from the games the rig played, so the two panels in
// src/screens/leaguePanels.tsx render here from the same shapes they render
// from in the product. If a board is added there it must be added here, and the
// test that pairs the two lists says so.

// Types only: the read itself reaches Postgres, and this file is bundled into
// a page. The constants below are its constants, and a test holds them equal.
import type {
  LeaderBoard, LeaderRow, LeagueGroup, TableRow,
} from '../../supabase/functions/_shared/api/reads/league.ts';
import type { PlayerStatLine } from '../../supabase/functions/_shared/engine/types.ts';
import { ranking, type Game, type PlayedGame } from './host.ts';
import { conferences, divisions } from './world.ts';

/** Which board reads which field of a stat line, in the read's own order. */
const BOARDS: readonly {
  readonly key: string; readonly label: string;
  readonly side: LeaderBoard['side']; readonly unit: string;
  readonly of: (line: PlayerStatLine) => number;
}[] = [
  { key: 'passYards', label: 'Passing yards', side: 'OFFENCE', unit: 'yds', of: (l) => l.passYards },
  { key: 'passTds', label: 'Passing touchdowns', side: 'OFFENCE', unit: 'td', of: (l) => l.passTouchdowns },
  { key: 'rushYards', label: 'Rushing yards', side: 'OFFENCE', unit: 'yds', of: (l) => l.rushYards },
  { key: 'rushTds', label: 'Rushing touchdowns', side: 'OFFENCE', unit: 'td', of: (l) => l.rushTouchdowns },
  { key: 'recYards', label: 'Receiving yards', side: 'OFFENCE', unit: 'yds', of: (l) => l.receivingYards },
  { key: 'recTds', label: 'Receiving touchdowns', side: 'OFFENCE', unit: 'td', of: (l) => l.receivingTouchdowns },
  { key: 'receptions', label: 'Receptions', side: 'OFFENCE', unit: 'rec', of: (l) => l.receptions },
  { key: 'sacks', label: 'Sacks', side: 'DEFENCE', unit: 'sk', of: (l) => l.sacks },
  { key: 'interceptions', label: 'Interceptions', side: 'DEFENCE', unit: 'int', of: (l) => l.interceptions },
  { key: 'tackles', label: 'Tackles', side: 'DEFENCE', unit: 'tkl', of: (l) => l.tackles },
  { key: 'fieldGoals', label: 'Field goals', side: 'KICKING', unit: 'fg', of: (l) => l.fieldGoalsMade },
  { key: 'puntYards', label: 'Punting yards', side: 'KICKING', unit: 'yds', of: (l) => l.puntYards },
];

/** The read's board keys and depth, for the test that holds the two copies
 *  together. */
export const BOARD_KEYS: readonly string[] = BOARDS.map((b) => b.key);
export const BOARD_DEPTH = 10;



export type Competition = 'REGULAR' | 'PLAYOFF';

interface Totals {
  readonly teamId: string;
  games: number;
  readonly values: number[];
}

function totalsFor(games: readonly PlayedGame[]): Map<string, Totals> {
  const out = new Map<string, Totals>();
  for (const game of games) {
    for (const line of game.players) {
      let t = out.get(line.playerId);
      if (t === undefined) {
        t = { teamId: line.teamId, games: 0, values: BOARDS.map(() => 0) };
        out.set(line.playerId, t);
      }
      t.games += 1;
      // The club a line was recorded for is the club shown: a player traded in
      // season leads for whoever he last played for, as the projection has it.
      for (const [i, board] of BOARDS.entries()) t.values[i] = (t.values[i] ?? 0) + board.of(line);
    }
  }
  return out;
}

export function boardsFor(game: Game, competition: Competition): LeaderBoard[] {
  const played = competition === 'PLAYOFF' ? game.playoffs : game.results;
  const totals = totalsFor(played);
  const byId = new Map(game.league.players.map((p) => [p.id, p]));
  return BOARDS.map((board, i) => {
    const rows: LeaderRow[] = [...totals.entries()]
      .map(([playerId, t]) => ({ playerId, value: t.values[i] ?? 0, games: t.games, teamId: t.teamId }))
      .filter((r) => r.value > 0)
      .sort((a, b) => (b.value === a.value ? a.playerId.localeCompare(b.playerId) : b.value - a.value))
      .slice(0, BOARD_DEPTH)
      .map((r) => {
        const player = byId.get(r.playerId);
        return {
          playerId: r.playerId,
          name: player?.name ?? r.playerId,
          group: player?.group ?? '—',
          teamId: r.teamId, value: r.value, games: r.games,
        };
      });
    return { key: board.key, label: board.label, side: board.side, unit: board.unit, rows };
  });
}

export function tableFor(game: Game): TableRow[] {
  const seedOf = new Map(game.seeds.map((s) => [s.teamId, s.seed]));
  // Division winners are what the bracket drew, not a guess: before the field
  // is seeded no club is marked, which is what the server's playoff_status
  // does too.
  const winners = new Set(game.seeds.filter((s) => s.divisionWinner).map((s) => s.teamId));
  return ranking(game.standings).map((s) => {
    const club = game.clubs.get(s.teamId);
    return {
      teamId: s.teamId,
      conferenceId: club?.conferenceId ?? '',
      divisionId: club?.divisionId ?? '',
      wins: s.wins, losses: s.losses, ties: s.ties,
      played: s.wins + s.losses + s.ties,
      pointsFor: s.pointsFor, pointsAgainst: s.pointsAgainst,
      seed: seedOf.get(s.teamId) ?? null,
      divisionWinner: winners.has(s.teamId),
      streak: s.streak,
    };
  });
}

export const leagueGroups = (): { conferences: LeagueGroup[]; divisions: LeagueGroup[] } =>
  ({ conferences: conferences(), divisions: divisions() });
