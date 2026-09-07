// The game loop: possessions, downs, field position, clock and scoring.
//
// Pure. It reads two TeamState values and a seeded generator, mutates only
// structures it created itself, and returns a result. Given the same inputs it
// produces the same output, on any JavaScript runtime.

import { CALIBRATION, clamp } from './calibration.ts';
import { buildBoxScore } from './boxScore.ts';
import { makePlayEvent } from './event.ts';
import {
  addScore,
  clockCost,
  createGameState,
  halfRemaining,
  other,
  scoreOf,
  situationOf,
} from './gameState.ts';
import { rollInjuries } from './injury.ts';
import { callPlay, fieldGoalDistance } from './playcall.ts';
import {
  fieldGoalProbability,
  resolveFieldGoal,
  resolvePass,
  resolvePunt,
  resolveRun,
  type PlayResolution,
} from './plays.ts';
import { unitRatings } from './ratings.ts';
import {
  DEFENSE_GROUPS,
  OFFENSE_GROUPS,
  chargeSnaps,
  createRuntime,
  recover,
  starterOf,
  unitOnField,
  type TeamRuntime,
} from './roster.ts';
import type { Rng } from './rng.ts';
import {
  CLEAR_WEATHER,
  type GameOptions,
  type GameResult,
  type InjuryEvent,
  type PlayEvent,
  type PlayType,
  type Side,
  type TeamState,
  type Weather,
} from './types.ts';


export function simulateGame(
  homeTeam: TeamState,
  awayTeam: TeamState,
  rng: Rng,
  options: GameOptions = {},
): GameResult {
  const weather: Weather = options.weather ?? CLEAR_WEATHER;
  const neutral = options.neutralSite === true;
  const allowTie = options.allowTie !== false;

  const runtimes: Record<Side, TeamRuntime> = {
    home: createRuntime(homeTeam),
    away: createRuntime(awayTeam),
  };
  const events: PlayEvent[] = [];
  const injuries: InjuryEvent[] = [];

  // Coin toss: the loser of the toss receives to open, the winner to open the
  // second half. Drawn first so the toss does not shift with later changes.
  const homeWinsToss = rng.chance(0.5);
  const opening: Side = homeWinsToss ? 'away' : 'home';

  const state = createGameState(opening);
  state.driveCount[opening] += 1;

  // Home-field advantage belongs to the home team only. Applying it to whoever
  // holds the ball would hand it to the visitors on their own possessions and
  // cancel it out over a game -- which is exactly what the home win rate showed
  // before this was scoped to the possessing side.
  const homeFieldFor = (side: Side): { pass: number; run: number } =>
    neutral || side === 'away'
      ? { pass: 0, run: 0 }
      : { pass: CALIBRATION.homeField.passDiff, run: CALIBRATION.homeField.runDiff };

  function emit(
    playType: PlayType,
    resolution: PlayResolution,
    consumed: number,
    points: number,
    firstDown: boolean,
    injury: InjuryEvent | undefined,
  ): void {
    events.push(makePlayEvent({
      index: events.length,
      quarter: state.quarter,
      clock: state.clock,
      offense: runtimes[state.possession].team.id,
      defense: runtimes[other(state.possession)].team.id,
      down: state.down,
      distance: state.distance,
      yardLine: state.yardLine,
      homeScore: state.homeScore,
      awayScore: state.awayScore,
    }, playType, resolution, consumed, points, firstDown, injury));
  }

  /** Snap charging plus the injury roll, for both sides of the ball. */
  function chargeAndRollInjuries(playType: PlayType, wasSack: boolean): InjuryEvent | undefined {
    const offenseRt = runtimes[state.possession];
    const defenseRt = runtimes[other(state.possession)];
    const offenseUnit = unitOnField(offenseRt, OFFENSE_GROUPS);
    const defenseUnit = unitOnField(defenseRt, DEFENSE_GROUPS);
    chargeSnaps(offenseRt, offenseUnit);
    chargeSnaps(defenseRt, defenseUnit);
    const offenseInjury = rollInjuries(offenseRt, offenseUnit, playType, wasSack, rng);
    const defenseInjury = rollInjuries(defenseRt, defenseUnit, playType, wasSack, rng);
    const injury = offenseInjury ?? defenseInjury;
    if (injury !== undefined) injuries.push(injury);
    return injury;
  }

  function giveBall(to: Side, yardLine: number): void {
    recover(runtimes[state.possession]);
    recover(runtimes[to]);
    state.possession = to;
    state.yardLine = clamp(yardLine, 1, 99);
    state.down = 1;
    state.distance = Math.min(10, 100 - state.yardLine);
    state.driveCount[to] += 1;
  }

  /** Extra point, or a two-point try when the arithmetic calls for one. */
  function convert(side: Side): void {
    const offenseRt = runtimes[side];
    const deficit = scoreOf(state, other(side)) - scoreOf(state, side);
    const late = state.quarter >= 4 && halfRemaining(state) < 300;
    const goForTwo = late && (deficit === 1 || deficit === 4 || deficit === 9);

    if (goForTwo) {
      const units = { offense: unitRatings(offenseRt), defense: unitRatings(runtimes[other(side)]) };
      const good = rng.chance(clamp(
        0.47 + (units.offense.passOffense - units.defense.passDefense) * 0.006, 0.2, 0.75,
      ));
      if (good) addScore(state, side, 2);
      emit('extraPoint', {
        outcome: good ? 'extraPointGood' : 'extraPointMissed',
        yards: 0, clockStops: true, turnover: false, wasSack: false,
      }, 0, good ? 2 : 0, false, undefined);
      return;
    }

    const kicker = starterOf(offenseRt, 'K');
    const good = rng.chance(
      fieldGoalProbability(CALIBRATION.kicking.extraPointDistance, kicker, weather),
    );
    if (good) addScore(state, side, 1);
    emit('extraPoint', {
      outcome: good ? 'extraPointGood' : 'extraPointMissed',
      yards: 0, clockStops: true, turnover: false, wasSack: false, kicker,
    }, 0, good ? 1 : 0, false, undefined);
  }

  function kickoffTo(receiving: Side): void {
    const touchback = rng.chance(CALIBRATION.kicking.kickoffTouchbackShare);
    const start = touchback
      ? CALIBRATION.drive.touchbackYardLine
      : clamp(Math.round(rng.normal(CALIBRATION.kicking.kickoffReturnMeanYards, 8)), 1, 99);
    // Emitted from the kicking team's perspective, before possession changes, so
    // the event stream contains every snap rather than only plays from
    // scrimmage. Kickoffs are excluded from the offensive play count in the box
    // score.
    state.possession = other(receiving);
    emit('kickoff', {
      outcome: touchback ? 'touchback' : 'gain',
      yards: start, clockStops: true, turnover: true, wasSack: false,
    }, 0, 0, false, undefined);
    giveBall(receiving, start);
  }

  /** True when the current period has expired. */
  function periodOver(): boolean {
    return state.clock <= 0;
  }

  function endOfRegulationTied(): boolean {
    return state.homeScore === state.awayScore;
  }

  // ------------------------------------------------------------------ main loop
  let guard = 0;
  const maxPlays = 800;

  while (guard < maxPlays) {
    guard += 1;

    if (periodOver()) {
      if (state.quarter === 2) {
        state.quarter = 3;
        state.clock = CALIBRATION.clock.quarterSeconds;
        kickoffTo(state.secondHalfReceiver);
        continue;
      }
      if (state.quarter === 4) {
        if (!endOfRegulationTied()) break;
        if (allowTie && state.overtime) break;
        if (state.overtime) break;
        state.overtime = true;
        state.quarter = 5;
        state.clock = CALIBRATION.clock.overtimeSeconds;
        kickoffTo(rng.chance(0.5) ? 'home' : 'away');
        continue;
      }
      if (state.quarter >= 5) break;
      state.quarter += 1;
      state.clock = CALIBRATION.clock.quarterSeconds;
      continue;
    }

    const offenseRt = runtimes[state.possession];
    const defenseRt = runtimes[other(state.possession)];
    const units = { offense: unitRatings(offenseRt), defense: unitRatings(defenseRt) };
    const sit = situationOf(state);
    const call = callPlay(sit, offenseRt.team.scheme, offenseRt.team.coaching, rng);

    const hurrying =
      sit.halfRemaining < CALIBRATION.clock.hurryUpThreshold && sit.scoreDiff <= 0;

    if (call === 'kneel') {
      const consumed = 42;
      emit('kneel', {
        outcome: 'kneel', yards: -1, clockStops: false, turnover: false, wasSack: false,
      }, consumed, 0, false, undefined);
      state.clock -= consumed;
      state.possessionSeconds[state.possession] += consumed;
      state.down += 1;
      state.distance += 1;
      continue;
    }

    if (call === 'punt') {
      const { resolution, nextYardLine } = resolvePunt(offenseRt, state.yardLine, weather, rng);
      const consumed = 12;
      emit('punt', resolution, consumed, 0, false, undefined);
      state.clock -= consumed;
      state.possessionSeconds[state.possession] += consumed;
      giveBall(other(state.possession), nextYardLine);
      continue;
    }

    if (call === 'fieldGoal') {
      const distance = fieldGoalDistance(state.yardLine);
      const resolution = resolveFieldGoal(offenseRt, distance, weather, rng);
      const good = resolution.outcome === 'fieldGoalGood';
      const consumed = 6;
      if (good) addScore(state, state.possession, 3);
      emit('fieldGoal', resolution, consumed, good ? 3 : 0, false, undefined);
      state.clock -= consumed;
      state.possessionSeconds[state.possession] += consumed;
      if (good) {
        if (state.overtime) break;
        kickoffTo(other(state.possession));
      } else {
        // A miss hands the ball over at the spot of the kick.
        giveBall(other(state.possession), clamp(100 - state.yardLine + 7, 1, 99));
      }
      continue;
    }

    // Crowd noise. A pre-snap penalty on the visiting offence replays the down
    // from five yards back, which is the small, real mechanism behind part of
    // home-field advantage.
    if (state.possession === 'away' && !neutral &&
        rng.chance(CALIBRATION.homeField.awayFalseStartRate)) {
      emit('penalty', {
        outcome: 'falseStart', yards: -5, clockStops: true, turnover: false, wasSack: false,
      }, 5, 0, false, undefined);
      state.clock -= 5;
      state.yardLine = Math.max(1, state.yardLine - 5);
      state.distance += 5;
      continue;
    }

    const isRun = call === 'run';
    const advantage = homeFieldFor(state.possession);
    const resolution = isRun
      ? resolveRun(offenseRt, defenseRt, units, advantage.run, rng)
      : resolvePass(offenseRt, defenseRt, units, advantage.pass, weather, rng);
    const injury = chargeAndRollInjuries(isRun ? 'run' : 'pass', resolution.wasSack);
    const consumed = clockCost(resolution, hurrying, offenseRt.team.scheme.tempo);

    // Yardage is capped by the goal line in both directions.
    const gained = clamp(resolution.yards, -state.yardLine + 1, 100 - state.yardLine);
    const endsInEndZone = state.yardLine + resolution.yards >= 100;
    const safety = state.yardLine + resolution.yards <= 0;

    if (resolution.turnover) {
      emit(isRun ? 'run' : 'pass', { ...resolution, yards: gained },
        consumed, 0, false, injury);
      state.clock -= consumed;
      state.possessionSeconds[state.possession] += consumed;
      const spot = resolution.outcome === 'interception'
        ? state.yardLine + Math.max(0, resolution.yards)
        : state.yardLine + gained;
      giveBall(other(state.possession), clamp(100 - spot, 1, 99));
      continue;
    }

    if (endsInEndZone) {
      const scorer = state.possession;
      addScore(state, scorer, 6);
      emit(isRun ? 'run' : 'pass',
        { ...resolution, outcome: 'touchdown', yards: 100 - state.yardLine },
        consumed, 6, true, injury);
      state.clock -= consumed;
      state.possessionSeconds[scorer] += consumed;
      convert(scorer);
      if (state.overtime) break;
      kickoffTo(other(scorer));
      continue;
    }

    if (safety) {
      addScore(state, other(state.possession), 2);
      emit(isRun ? 'run' : 'pass', { ...resolution, outcome: 'safety', yards: gained },
        consumed, 2, false, injury);
      state.clock -= consumed;
      state.possessionSeconds[state.possession] += consumed;
      kickoffTo(other(state.possession));
      continue;
    }

    const firstDown = gained >= state.distance;
    emit(isRun ? 'run' : 'pass', { ...resolution, yards: gained },
      consumed, 0, firstDown, injury);
    state.clock -= consumed;
    state.possessionSeconds[state.possession] += consumed;
    state.yardLine += gained;

    if (firstDown) {
      state.down = 1;
      state.distance = Math.min(10, 100 - state.yardLine);
    } else if (state.down === 4) {
      giveBall(other(state.possession), clamp(100 - state.yardLine, 1, 99));
    } else {
      state.down += 1;
      state.distance -= gained;
    }
  }

  return buildBoxScore(
    homeTeam, awayTeam, events, injuries, weather,
    state.homeScore, state.awayScore, state.overtime,
    state.driveCount, state.possessionSeconds,
  );
}
