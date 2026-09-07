// What counts as a story.
//
// Every detector answers two questions -- did this happen, and how much does it
// matter -- and none of them knows any English. Thresholds live in NEWS_RULES so
// a decision about what is newsworthy can be argued about without reading prose,
// and a phrasing can be added without re-reading football logic.

import type {
  AwardRaceNews, CoachNews, GameNews, InjuryNews, NewsFact, PlayerNews,
  TeamNews, WeekInput,
} from './types.ts';

export const NEWS_RULES = {
  upset: {
    /** Rating points the winner must have been behind for it to be a story. */
    minGap: 4,
    /** Above this, it is the story of the week rather than a curiosity. */
    bigGap: 9,
    /** Margin at or under which even a big upset reads as a scrappy one. */
    closeMargin: 7,
  },
  streak: {
    /** Three is a run. Two is a coincidence. */
    minimum: 3,
    /** Report a run again only after it has grown by this much, so the same
     *  club is not the lead story for six consecutive weeks. */
    reportEvery: 2,
  },
  milestone: {
    game: { passYards: 350, rushYards: 125, recYards: 125 },
    /** Season thresholds are reported the week they are crossed, once each. */
    seasonPassYards: [3000, 4000, 5000],
    seasonRushYards: [1000, 1500, 2000],
    seasonRecYards: [1000, 1400, 1800],
    seasonSacks: [10, 15, 20],
  },
  injury: {
    /** Weeks out at or above which a non-season-ending injury is reported. */
    majorWeeks: 4,
  },
  hotSeat: {
    /** Hot-seat rating above which the job is genuinely in question. */
    rating: 55,
    /** Wins below expectation before it becomes a story. */
    shortfall: 2,
    /** And above expectation, for the other side of it. */
    surplus: 2,
    /** Nothing to say before a record means anything. */
    fromWeek: 6,
  },
  awardRace: {
    fromWeek: 8,
    /** Margin as a share of the leader's total, under which a race is tight. */
    tightShare: 0.06,
    /** And over which it is effectively settled. */
    clearShare: 0.18,
  },
  /** Stories per week. A feed of forty items is not a feed. */
  maxPerWeek: 8,
  /**
   * And no category may take more than this many of them.
   *
   * Ranking on importance alone starves whole categories: a busy week produces
   * six hot-seat stories rated above every award race in the league, so the
   * award race is never written at all. The cap is what keeps a week's feed a
   * spread of what happened rather than a list of one thing.
   */
  maxPerCategory: 3,
} as const;

const clamp5 = (n: number): number => Math.max(1, Math.min(5, Math.round(n)));
const recordOf = (t: TeamNews): string =>
  t.ties > 0 ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`;

function indexTeams(teams: readonly TeamNews[]): Map<string, TeamNews> {
  return new Map(teams.map((t) => [t.teamId, t]));
}

/** A result where the weaker side won. */
export function detectUpsets(games: readonly GameNews[], teams: readonly TeamNews[]): NewsFact[] {
  const byId = indexTeams(teams);
  const facts: NewsFact[] = [];

  for (const game of games) {
    if (game.homeScore === game.awayScore) continue;
    const homeWon = game.homeScore > game.awayScore;
    const winner = byId.get(homeWon ? game.homeTeamId : game.awayTeamId);
    const loser = byId.get(homeWon ? game.awayTeamId : game.homeTeamId);
    if (winner === undefined || loser === undefined) continue;

    const gap = loser.rating - winner.rating;
    if (gap < NEWS_RULES.upset.minGap) continue;

    const margin = Math.abs(game.homeScore - game.awayScore);
    const big = gap >= NEWS_RULES.upset.bigGap && margin > NEWS_RULES.upset.closeMargin;
    facts.push({
      category: 'UPSET',
      kind: big ? 'upset.big' : 'upset.close',
      importance: clamp5(2.6 + gap / 5),
      slots: {
        winner: winner.name,
        loser: loser.name,
        winScore: String(Math.max(game.homeScore, game.awayScore)),
        loseScore: String(Math.min(game.homeScore, game.awayScore)),
      },
      teamId: winner.teamId,
      playerId: null,
      gameId: game.gameId,
    });
  }
  return facts;
}

/** A run long enough to mean something, reported as it lengthens rather than
 *  every single week. */
export function detectStreaks(teams: readonly TeamNews[]): NewsFact[] {
  const facts: NewsFact[] = [];
  for (const team of teams) {
    const length = Math.abs(team.streak);
    if (length < NEWS_RULES.streak.minimum) continue;
    // Report at the threshold and then every couple of games, so a fifteen-game
    // run is a story four times rather than thirteen.
    const steps = length - NEWS_RULES.streak.minimum;
    if (steps % NEWS_RULES.streak.reportEvery !== 0) continue;

    const winning = team.streak > 0;
    facts.push({
      category: 'STREAK',
      kind: winning ? 'streak.win' : 'streak.loss',
      importance: clamp5(2 + length / 3),
      slots: { team: team.name, count: String(length), record: recordOf(team) },
      teamId: team.teamId,
      playerId: null,
      gameId: null,
    });
  }
  return facts;
}

interface MilestoneSpec {
  readonly gameValue: number;
  readonly seasonValue: number;
  readonly gameThreshold: number;
  readonly seasonThresholds: readonly number[];
  readonly label: string;
}

function specsFor(player: PlayerNews): MilestoneSpec[] {
  const m = NEWS_RULES.milestone;
  return [
    {
      gameValue: player.gamePassYards, seasonValue: player.seasonPassYards,
      gameThreshold: m.game.passYards, seasonThresholds: m.seasonPassYards,
      label: 'passing yards',
    },
    {
      gameValue: player.gameRushYards, seasonValue: player.seasonRushYards,
      gameThreshold: m.game.rushYards, seasonThresholds: m.seasonRushYards,
      label: 'rushing yards',
    },
    {
      gameValue: player.gameRecYards, seasonValue: player.seasonRecYards,
      gameThreshold: m.game.recYards, seasonThresholds: m.seasonRecYards,
      label: 'receiving yards',
    },
  ];
}

/** Big afternoons, and season totals crossed this week. */
export function detectMilestones(input: WeekInput): NewsFact[] {
  const byId = indexTeams(input.teams);
  const facts: NewsFact[] = [];
  const remaining = Math.max(0, input.totalWeeks - input.week);

  for (const player of input.players) {
    const team = byId.get(player.teamId);
    const teamName = team?.nickname ?? team?.name;
    if (teamName === undefined) continue;

    for (const spec of specsFor(player)) {
      if (spec.gameValue >= spec.gameThreshold) {
        facts.push({
          category: 'MILESTONE',
          kind: 'milestone.game',
          importance: clamp5(2.4 + (spec.gameValue - spec.gameThreshold) / 60),
          slots: {
            player: player.name, team: teamName, position: player.position,
            value: String(spec.gameValue), statLabel: spec.label,
          },
          teamId: player.teamId, playerId: player.playerId, gameId: null,
        });
      }

      // Crossed this week: the total before the game was below the mark and the
      // total after is not. Reported once, in the week it happened.
      const before = spec.seasonValue - spec.gameValue;
      for (const threshold of spec.seasonThresholds) {
        if (before < threshold && spec.seasonValue >= threshold) {
          facts.push({
            category: 'MILESTONE',
            kind: 'milestone.season',
            importance: clamp5(3 + spec.seasonThresholds.indexOf(threshold)),
            slots: {
              player: player.name, team: teamName, position: player.position,
              value: String(threshold), statLabel: spec.label,
              week: String(input.week), remaining: String(remaining),
            },
            teamId: player.teamId, playerId: player.playerId, gameId: null,
          });
        }
      }
    }
  }
  return facts;
}

/** Absences long enough to change what a club can do. */
export function detectInjuries(
  injuries: readonly InjuryNews[], teams: readonly TeamNews[],
): NewsFact[] {
  const byId = indexTeams(teams);
  const facts: NewsFact[] = [];

  for (const injury of injuries) {
    const team = byId.get(injury.teamId);
    const teamName = team?.nickname ?? team?.name;
    if (teamName === undefined) continue;

    const ending = injury.severity === 'seasonEnding';
    if (!ending && injury.weeksOut < NEWS_RULES.injury.majorWeeks) continue;

    facts.push({
      category: 'INJURY',
      kind: ending ? 'injury.season' : 'injury.major',
      importance: clamp5((ending ? 4 : 3) + (injury.starter ? 1 : 0)),
      slots: {
        player: injury.name, team: teamName, position: injury.position,
        weeks: String(injury.weeksOut),
      },
      teamId: injury.teamId, playerId: injury.playerId, gameId: null,
    });
  }
  return facts;
}

/** A record far enough from what the roster promised to be a question. */
export function detectHotSeat(
  coaches: readonly CoachNews[], teams: readonly TeamNews[], week: number,
): NewsFact[] {
  if (week < NEWS_RULES.hotSeat.fromWeek) return [];
  const byId = indexTeams(teams);
  const facts: NewsFact[] = [];

  for (const coach of coaches) {
    const team = byId.get(coach.teamId);
    if (team === undefined) continue;
    const gap = coach.wins - coach.expectedWins;

    const underPressure = coach.hotSeat >= NEWS_RULES.hotSeat.rating
      && gap <= -NEWS_RULES.hotSeat.shortfall;
    const exceeding = gap >= NEWS_RULES.hotSeat.surplus
      && coach.hotSeat >= NEWS_RULES.hotSeat.rating;
    if (!underPressure && !exceeding) continue;

    facts.push({
      category: 'HOT_SEAT',
      kind: underPressure ? 'hot_seat.pressure' : 'hot_seat.reprieve',
      // Deliberately short of 5. A coach's seat is a season-long storyline,
      // not the story of any one week; letting it reach the top of the scale
      // put six of them above everything else that happened.
      importance: clamp5(Math.min(4, 2 + Math.abs(gap) / 4)),
      slots: {
        coach: coach.name, team: team.name, record: recordOf(team),
        expected: String(Math.round(coach.expectedWins)),
        tenure: String(coach.seasonsWithTeam),
      },
      teamId: coach.teamId, playerId: null, gameId: null,
    });
  }
  return facts;
}

/** Races worth following, once a record means something. */
export function detectAwardRaces(
  races: readonly AwardRaceNews[], teams: readonly TeamNews[], week: number,
  totalWeeks = 18,
): NewsFact[] {
  if (week < NEWS_RULES.awardRace.fromWeek) return [];
  const byId = indexTeams(teams);
  const facts: NewsFact[] = [];

  const span = Math.max(1, totalWeeks - NEWS_RULES.awardRace.fromWeek);
  const lateness = Math.max(0, Math.min(1, (week - NEWS_RULES.awardRace.fromWeek) / span));

  for (const race of races) {
    if (race.leaderValue <= 0) continue;
    const share = race.margin / race.leaderValue;
    const tight = share <= NEWS_RULES.awardRace.tightShare && race.chaserName !== null;
    const clear = share >= NEWS_RULES.awardRace.clearShare;
    if (!tight && !clear) continue;

    const team = byId.get(race.leaderTeamId);
    facts.push({
      category: 'AWARD_RACE',
      kind: tight ? 'award.tight' : 'award.clear',
      // A race matters more the less season is left to change it. Flat at 3, an
      // award race never survived a busy week's cut and the category was
      // effectively unpublished; week 17 with nothing between two players is a
      // bigger story than most injuries, and this says so.
      importance: clamp5((tight ? 3 : 2) + lateness * 1.6),
      slots: {
        award: race.awardName,
        leader: race.leaderName,
        chaser: race.chaserName ?? 'the field',
        team: team?.nickname ?? team?.name ?? 'their club',
        value: String(Math.round(race.leaderValue)),
        statLabel: race.statLabel,
      },
      teamId: race.leaderTeamId, playerId: race.leaderPlayerId, gameId: null,
    });
  }
  return facts;
}

/** Every fact in a week, unordered. */
export function detectAll(input: WeekInput): NewsFact[] {
  return [
    ...detectUpsets(input.games, input.teams),
    ...detectStreaks(input.teams),
    ...detectMilestones(input),
    ...detectInjuries(input.injuries, input.teams),
    ...detectHotSeat(input.coaches, input.teams, input.week),
    ...detectAwardRaces(input.awardRaces, input.teams, input.week, input.totalWeeks),
  ];
}
