// Simulates a real season and turns each week's events into news input.
//
// Not fixtures: the 32 clubs, the 272-game schedule and every rating come from
// the seed, and every story traces to something the game engine actually
// produced. A news engine validated only against handwritten fixtures proves
// that the templates render, not that the detectors fire on real football.
//
// Absences carry across weeks, as they do in scripts/sim-report/season.ts and
// for the same reason: the engine treats a game as independent, so a harness
// that never sits an injured player out reports a league where nobody is ever
// missing. Without it a club eventually loses every quarterback it has and the
// run dies on MissingUnitError -- which is exactly how this was found.

import { numberOrUndefined, readSeedCsv } from '../lib/seedCsv.ts';
import { createRng, type Rng } from '../../supabase/functions/_shared/engine/rng.ts';
import { simulateGame } from '../../supabase/functions/_shared/engine/simulateGame.ts';
import type { EnginePlayer, TeamState } from '../../supabase/functions/_shared/engine/types.ts';
import type {
  AwardRaceNews, CoachNews, GameNews, InjuryNews, PlayerNews, TeamNews, WeekInput,
} from '../../supabase/functions/_shared/engine/news/index.ts';
import { loadLeague, type League } from '../sim-report/league.ts';
import { withoutInjured } from '../sim-report/season.ts';
import { MissingUnitError } from '../../supabase/functions/_shared/engine/types.ts';

interface Identity {
  readonly name: string;
  readonly nickname: string;
}

interface Standing {
  wins: number;
  losses: number;
  ties: number;
  streak: number;
}

interface PlayerTotals {
  passYards: number;
  rushYards: number;
  recYards: number;
  sacks: number;
}

/** Metro plus nickname, from the seed. */
function loadIdentities(): Map<string, Identity> {
  const out = new Map<string, Identity>();
  for (const row of readSeedCsv('teams')) {
    const id = row['team_id'] ?? '';
    const metro = row['metro_area'] ?? '';
    const nickname = row['nickname'] ?? '';
    if (id === '') continue;
    out.set(id, { name: `${metro} ${nickname}`.trim(), nickname });
  }
  return out;
}

/** Head coach per club. */
function loadHeadCoaches(): Map<string, { id: string; name: string; tenure: number; hotSeat: number }> {
  const out = new Map<string, { id: string; name: string; tenure: number; hotSeat: number }>();
  for (const row of readSeedCsv('coaches')) {
    if (row['role'] !== 'Head Coach') continue;
    const teamId = row['team_id'] ?? '';
    if (teamId === '') continue;
    out.set(teamId, {
      id: row['coach_id'] ?? '',
      name: row['display_name'] ?? '',
      tenure: numberOrUndefined(row['years_experience']) ?? 1,
      hotSeat: numberOrUndefined(row['hot_seat_rating']) ?? 40,
    });
  }
  return out;
}

/**
 * What a roster of this quality should win.
 *
 * legacy/ENGINE.md derives coach expectation from the top-24 talent rather than
 * from a flat number, which is what makes a hot-seat story about a club
 * underperforming rather than about a club simply being bad.
 */
function expectedWins(team: TeamState): number {
  const top = team.players.map((p) => p.ratings.overall)
    .sort((a, b) => b - a).slice(0, 24);
  const talent = top.reduce((a, b) => a + b, 0) / Math.max(top.length, 1);
  return (talent - 66) * 0.72 + 8.5;
}

function teamRating(team: TeamState): number {
  const top = team.players.map((p) => p.ratings.overall)
    .sort((a, b) => b - a).slice(0, 24);
  return top.reduce((a, b) => a + b, 0) / Math.max(top.length, 1);
}

export interface SeasonNews {
  readonly weeks: readonly WeekInput[];
  readonly league: League;
  /** Games no club could field a side for. Reported, never papered over. */
  readonly abandoned: number;
}

/** Simulates a season and returns one WeekInput per week. */
export function simulateSeasonForNews(season: number, seed: number): SeasonNews {
  const league = loadLeague();
  const rng: Rng = createRng(seed);
  const identities = loadIdentities();
  const coaches = loadHeadCoaches();
  const byId = new Map(league.teams.map((t) => [t.id, t]));

  const playersById = new Map<string, { player: EnginePlayer; teamId: string }>();
  for (const team of league.teams) {
    for (const player of team.players) playersById.set(player.id, { player, teamId: team.id });
  }

  const standings = new Map<string, Standing>();
  const totals = new Map<string, PlayerTotals>();
  const starters = new Set<string>();
  for (const team of league.teams) {
    standings.set(team.id, { wins: 0, losses: 0, ties: 0, streak: 0 });
    for (const group of Object.keys(team.depthChart) as (keyof typeof team.depthChart)[]) {
      const first = team.depthChart[group]?.[0];
      if (first !== undefined) starters.add(first);
    }
  }

  const weeks: WeekInput[] = [];
  // playerId -> weeks still to miss.
  const absence = new Map<string, number>();
  let abandoned = 0;

  for (let week = 1; week <= league.weeks; week += 1) {
    const fixtures = league.schedule.filter((f) => f.week === week);
    if (fixtures.length === 0) continue;

    const games: GameNews[] = [];
    const injuries: InjuryNews[] = [];
    const weekLines = new Map<string, PlayerTotals>();

    for (const fixture of fixtures) {
      const home = byId.get(fixture.homeTeamId);
      const away = byId.get(fixture.awayTeamId);
      if (home === undefined || away === undefined) continue;

      const out = new Set(absence.keys());
      let game;
      try {
        game = simulateGame(
          withoutInjured(home, out), withoutInjured(away, out), rng, { allowTie: true },
        );
      } catch (error) {
        // A club with no fieldable quarterback or offensive line cannot play.
        // Skipped and counted, never replaced with an invented result.
        if (error instanceof MissingUnitError) { abandoned += 1; continue; }
        throw error;
      }

      games.push({
        gameId: `G${season}W${String(week).padStart(2, '0')}_${home.id}${away.id}`,
        week,
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        overtime: game.overtime,
      });

      // Standings and streaks.
      const homeStanding = standings.get(home.id);
      const awayStanding = standings.get(away.id);
      if (homeStanding !== undefined && awayStanding !== undefined) {
        if (game.homeScore === game.awayScore) {
          homeStanding.ties += 1;
          awayStanding.ties += 1;
          homeStanding.streak = 0;
          awayStanding.streak = 0;
        } else {
          const homeWon = game.homeScore > game.awayScore;
          const winner = homeWon ? homeStanding : awayStanding;
          const loser = homeWon ? awayStanding : homeStanding;
          winner.wins += 1;
          loser.losses += 1;
          winner.streak = winner.streak > 0 ? winner.streak + 1 : 1;
          loser.streak = loser.streak < 0 ? loser.streak - 1 : -1;
        }
      }

      for (const line of game.players) {
        const running = totals.get(line.playerId)
          ?? { passYards: 0, rushYards: 0, recYards: 0, sacks: 0 };
        running.passYards += line.passYards;
        running.rushYards += line.rushYards;
        running.recYards += line.receivingYards;
        running.sacks += line.sacks;
        totals.set(line.playerId, running);

        weekLines.set(line.playerId, {
          passYards: line.passYards, rushYards: line.rushYards,
          recYards: line.receivingYards, sacks: line.sacks,
        });
      }

      for (const injury of game.injuries) {
        if (!injury.returnsThisGame) {
          const weeksOut = injury.severity === 'seasonEnding'
            ? league.weeks - week + 1
            : Math.max(1, injury.weeksOut);
          const current = absence.get(injury.playerId) ?? 0;
          if (weeksOut > current) absence.set(injury.playerId, weeksOut);
        }

        const found = playersById.get(injury.playerId);
        if (found === undefined) continue;
        injuries.push({
          playerId: injury.playerId,
          name: found.player.name,
          teamId: found.teamId,
          position: found.player.group,
          severity: injury.severity,
          weeksOut: injury.weeksOut,
          starter: starters.has(injury.playerId),
        });
      }
    }

    const teams: TeamNews[] = league.teams.map((team) => {
      const standing = standings.get(team.id);
      const identity = identities.get(team.id);
      return {
        teamId: team.id,
        name: identity?.name ?? team.id,
        nickname: identity?.nickname ?? team.id,
        wins: standing?.wins ?? 0,
        losses: standing?.losses ?? 0,
        ties: standing?.ties ?? 0,
        streak: standing?.streak ?? 0,
        rating: teamRating(team),
      };
    });

    const players: PlayerNews[] = [];
    for (const [playerId, line] of weekLines) {
      const found = playersById.get(playerId);
      const season_ = totals.get(playerId);
      if (found === undefined || season_ === undefined) continue;
      players.push({
        playerId,
        name: found.player.name,
        teamId: found.teamId,
        position: found.player.group,
        gamePassYards: line.passYards,
        gameRushYards: line.rushYards,
        gameRecYards: line.recYards,
        gameTouchdowns: 0,
        seasonPassYards: season_.passYards,
        seasonRushYards: season_.rushYards,
        seasonRecYards: season_.recYards,
        seasonSacks: season_.sacks,
      });
    }

    const coachNews: CoachNews[] = league.teams.flatMap((team) => {
      const coach = coaches.get(team.id);
      const standing = standings.get(team.id);
      if (coach === undefined || standing === undefined) return [];
      return [{
        coachId: coach.id,
        name: coach.name,
        teamId: team.id,
        wins: standing.wins,
        losses: standing.losses,
        // Scaled to the games played so far, so an expectation of nine wins is
        // not judged against a four-game record.
        expectedWins: (expectedWins(team) / league.weeks) * week,
        seasonsWithTeam: coach.tenure,
        hotSeat: coach.hotSeat,
      }];
    });

    weeks.push({
      season,
      week,
      phase: 'REGULAR_SEASON',
      totalWeeks: league.weeks,
      games,
      teams,
      players,
      injuries,
      coaches: coachNews,
      awardRaces: buildAwardRaces(totals, playersById),
    });

    for (const [playerId, remaining] of absence) {
      if (remaining <= 1) absence.delete(playerId);
      else absence.set(playerId, remaining - 1);
    }
  }

  return { weeks, league, abandoned };
}

/** Season leaders in the categories an award race follows. */
function buildAwardRaces(
  totals: ReadonlyMap<string, PlayerTotals>,
  playersById: ReadonlyMap<string, { player: EnginePlayer; teamId: string }>,
): AwardRaceNews[] {
  const races: { code: string; name: string; label: string; of: (t: PlayerTotals) => number }[] = [
    { code: 'PASSING', name: 'Passer of the Year', label: 'passing yards', of: (t) => t.passYards },
    { code: 'RUSHING', name: 'Rusher of the Year', label: 'rushing yards', of: (t) => t.rushYards },
    { code: 'RECEIVING', name: 'Receiver of the Year', label: 'receiving yards', of: (t) => t.recYards },
  ];

  const out: AwardRaceNews[] = [];
  for (const race of races) {
    const ranked = [...totals.entries()]
      .map(([id, t]) => ({ id, value: race.of(t) }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);

    const leader = ranked[0];
    const chaser = ranked[1];
    if (leader === undefined) continue;
    const found = playersById.get(leader.id);
    if (found === undefined) continue;

    out.push({
      awardCode: race.code,
      awardName: race.name,
      leaderPlayerId: leader.id,
      leaderName: found.player.name,
      leaderTeamId: found.teamId,
      leaderValue: leader.value,
      statLabel: race.label,
      margin: leader.value - (chaser?.value ?? 0),
      chaserName: chaser === undefined
        ? null
        : playersById.get(chaser.id)?.player.name ?? null,
    });
  }
  return out;
}
