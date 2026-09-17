// What camp thinks of a player, and who he is up against.
//
// Pure, and deliberately so. These are the judgements the whole preseason is
// built on -- who is safe, who is on the bubble, who is beaten -- and a
// judgement a test cannot pin is a judgement nobody can argue with. Facts in,
// a probability and a label out, no database and no clock.
//
// The inputs are the ones a front office would actually weigh, and every one
// of them is a column that exists: what he is rated, what he might become, how
// old he is, what he costs, what he cost to acquire, how deep the club already
// is at his position, whether he plays special teams, and -- once camp has
// been played -- how he has graded.
//
// Nothing here moves an overall rating. A good August makes a man likelier to
// be kept; it does not make him a better player. Conflating the two is how a
// preseason turns into a second draft.

import { STARTERS, type PositionGroup } from '../engine/types.ts';

export const ROSTER_STATUSES = [
  'LOCK', 'LIKELY', 'BUBBLE', 'LONG_SHOT', 'ROOKIE_WATCH', 'INJURED', 'CUT_CANDIDATE',
] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

export const STATUS_LABEL: Readonly<Record<RosterStatus, string>> = {
  LOCK: 'Lock',
  LIKELY: 'Likely',
  BUBBLE: 'Bubble',
  LONG_SHOT: 'Long shot',
  ROOKIE_WATCH: 'Rookie watch',
  INJURED: 'Injured',
  CUT_CANDIDATE: 'Cut candidate',
};

/** Everything the board reads about one player. */
export interface CampPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly group: PositionGroup;
  readonly overall: number;
  readonly potential: number;
  readonly age: number;
  readonly experienceYears: number;
  /** Cap charge this season, in dollars. */
  readonly capHit: number;
  /** What releasing him still costs. A big number is a reason to keep him that
   *  has nothing to do with football. */
  readonly deadMoney: number;
  readonly draftRound: number | null;
  /** Drafted by anybody this year. A rookie the club spent a pick on is a
   *  different case from an undrafted one in the same locker room. */
  readonly rookie: boolean;
  /** Where he sits in his position group's depth chart, 1 first. */
  readonly depth: number;
  /** How many players the club carries in his group. */
  readonly groupSize: number;
  /** 0-100. The engine models no kick coverage unit, so this is derived from
   *  what a coverage team is actually made of -- young, cheap, fast players in
   *  the back seven and the receiver room -- and it is named as a derivation
   *  everywhere it is shown. */
  readonly specialTeams: number;
  /** 0-100, how well his profile fits what the club plays. */
  readonly schemeFit: number;
  readonly injured: boolean;
  /** 0-100 from the practice field, always present once camp opens. */
  readonly practiceGrade: number;
  /** 0-100, or null before he has taken a preseason snap. */
  readonly preseasonGrade: number | null;
}

/** A starter is safe; the second man in a group is usually kept; past that a
 *  club is choosing. */
export const keepsAtGroup = (group: PositionGroup): number => {
  const starters = STARTERS[group];
  // Every group keeps at least one more than it starts, because a club that
  // carries exactly its starters has no answer to a hamstring. The specialists
  // are the exception: nobody carries two kickers.
  if (group === 'K' || group === 'P' || group === 'LS') return 1;
  return starters + Math.max(1, Math.round(starters / 2));
};

/**
 * How likely this player is to be on the 53, as a percentage.
 *
 * Built by starting from where he sits on the depth chart -- which is the
 * single best predictor and the one a manager can see -- and then moving it for
 * everything else. The moves are small on purpose: a fourth-string guard who
 * grades brilliantly in August is a likelier keep than he was, not a lock.
 */
export function rosterProbability(p: CampPlayer): number {
  const keeps = keepsAtGroup(p.group);
  // Depth first. Inside the keep line is strong, one outside it is the bubble,
  // and further out is a long way back.
  let score = p.depth <= STARTERS[p.group] ? 92
    : p.depth <= keeps ? 74
      : p.depth === keeps + 1 ? 46
        : Math.max(8, 38 - (p.depth - keeps - 1) * 9);

  // Money. Dead money is the reason a club keeps a player it has stopped
  // liking, and it is the reason a cheap player survives a better one.
  if (p.deadMoney > 0 && p.capHit > 0) {
    const stickiness = Math.min(1, p.deadMoney / Math.max(1, p.capHit));
    score += Math.round(stickiness * 14);
  }
  // An expensive player who is not starting is the classic cut.
  if (p.capHit >= 6_000_000 && p.depth > STARTERS[p.group]) score -= 16;

  // What the club spent to get him. A high pick is given a year he has not
  // earned; an undrafted rookie is given nothing.
  if (p.rookie) {
    if (p.draftRound !== null && p.draftRound <= 2) score += 22;
    else if (p.draftRound !== null && p.draftRound <= 4) score += 12;
    else if (p.draftRound !== null) score += 5;
    else score -= 6;
  }

  // Upside, but only where it can still be realised.
  const upside = p.potential - p.overall;
  if (upside >= 8 && p.age <= 24) score += 9;
  else if (upside >= 4 && p.age <= 26) score += 4;
  // The other end of a career. A 32-year-old backup is playing for his job
  // every August whatever he did last year.
  if (p.age >= 32 && p.depth > STARTERS[p.group]) score -= 10;

  // The two things that keep a fringe player: he covers kicks, and he fits.
  score += Math.round((p.specialTeams - 50) / 5);
  score += Math.round((p.schemeFit - 50) / 8);

  // Camp itself. Practice always counts; preseason counts once it exists, and
  // counts for more, because it happened against somebody else's players.
  score += Math.round((p.practiceGrade - 50) / 5);
  if (p.preseasonGrade !== null) score += Math.round((p.preseasonGrade - 50) / 3);

  // An injury in camp is not a verdict, but it is a club having to decide
  // whether to spend a roster place on a man who cannot play yet.
  if (p.injured) score -= 12;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * The label a manager reads instead of the number.
 *
 * Injured and Rookie Watch come first because they say something the
 * probability cannot: that this player's number is provisional. A rookie at 55
 * and a nine-year veteran at 55 are the same odds and completely different
 * situations, and a board that called both of them "Bubble" would be throwing
 * away the only thing that distinguishes them.
 */
export function rosterStatus(p: CampPlayer, probability: number): RosterStatus {
  if (p.injured) return 'INJURED';
  if (p.rookie && probability < 80) return 'ROOKIE_WATCH';
  if (probability >= 85) return 'LOCK';
  if (probability >= 65) return 'LIKELY';
  // An expensive veteran who is not going to make it is not merely a long
  // shot: he is a decision with a cap number attached, and the sooner the
  // manager sees it the more of it they can save.
  if (probability < 35 && p.capHit >= 4_000_000) return 'CUT_CANDIDATE';
  if (probability >= 40) return 'BUBBLE';
  return 'LONG_SHOT';
}

// ------------------------------------------------------------- camp battles

export interface CampBattle {
  readonly group: PositionGroup;
  /** The depth-chart place being fought over: 1 is the starting job. */
  readonly forDepth: number;
  /** True when the job at stake is a starting one. */
  readonly starting: boolean;
  /** Contenders, best current read first. */
  readonly players: readonly CampContender[];
  /** How close it is, 0-100. A hundred is a dead heat. */
  readonly closeness: number;
}

export interface CampContender extends CampPlayer {
  readonly probability: number;
  readonly status: RosterStatus;
}

/** How near two players are, on the scale the battle detector uses. */
const gap = (a: CampContender, b: CampContender): number =>
  Math.abs(campScore(a) - campScore(b));

/**
 * A player's standing in his own position room, in rating points.
 *
 * His overall, moved by what camp has shown. Written as a *deviation* from an
 * average grade rather than as a weighted average of the two, for two reasons.
 * A neutral camp then leaves a room in exactly the order it arrived in, which
 * is the correct answer to "nothing happened". And the result stays on the
 * rating scale, so BATTLE_GAP is four rating points -- a number somebody can
 * hold in their head -- rather than four units of a blend.
 *
 * The blend was the first attempt and its own test caught it: at a fifth of
 * the weight, a 90 practice grade overturned a twelve-point gap in overall,
 * so a 70 who had a good week outranked an 82 who had a quiet one. Three
 * practices do not undo a career. Here a spectacular camp is worth about six
 * points and a dreadful one costs about the same, which is roughly what a
 * coaching staff will admit to.
 */
export function campScore(p: CampPlayer): number {
  const seen = p.preseasonGrade ?? p.practiceGrade;
  return p.overall + (seen - 50) * 0.12 + Math.max(0, p.potential - p.overall) * 0.1;
}

/** Inside this many points, two players are competing rather than ranked. */
export const BATTLE_GAP = 4;

/**
 * The jobs that are actually being fought over.
 *
 * A battle is not "two players at the same position" -- every club has three
 * quarterbacks -- it is two players close enough that the depth chart could
 * honestly go either way. So the room is sorted by what camp has shown, and a
 * job is a battle when the man holding it and the man behind him are within
 * BATTLE_GAP of each other.
 */
export function campBattles(players: readonly CampContender[]): readonly CampBattle[] {
  const byGroup = new Map<PositionGroup, CampContender[]>();
  for (const p of players) {
    const list = byGroup.get(p.group) ?? [];
    list.push(p);
    byGroup.set(p.group, list);
  }

  const battles: CampBattle[] = [];
  for (const [group, room] of byGroup) {
    const ranked = [...room].sort((a, b) => campScore(b) - campScore(a));
    const contested = Math.min(ranked.length - 1, keepsAtGroup(group));
    for (let i = 0; i < contested; i += 1) {
      const holder = ranked[i];
      const challenger = ranked[i + 1];
      if (holder === undefined || challenger === undefined) continue;
      const distance = gap(holder, challenger);
      if (distance > BATTLE_GAP) continue;
      // Everybody still within reach of the job, not just the two nearest it:
      // a three-way for the last receiver spot is one battle, not two.
      const inReach = ranked.slice(i).filter(
        (p) => campScore(holder) - campScore(p) <= BATTLE_GAP);
      battles.push({
        group,
        forDepth: i + 1,
        starting: i < STARTERS[group],
        players: inReach,
        closeness: Math.max(0, Math.round(100 - (distance / BATTLE_GAP) * 100)),
      });
      // The men in this battle are spoken for; the next job starts after them.
      i += inReach.length - 2;
    }
  }
  // The starting jobs first, then the closest of the rest: a manager opening
  // this screen wants the quarterback competition before the fifth receiver.
  return battles.sort((a, b) => (Number(b.starting) - Number(a.starting))
    || (b.closeness - a.closeness));
}
