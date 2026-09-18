// Public surface of the simulation engine.
//
// The engine performs no I/O. It does not read a database, a clock, a file or
// the network, and it never calls Math.random(). Everything random comes from
// the Rng passed in, so simulateGame(home, away, createRng(seed)) is a pure
// function of its arguments. scripts/lint-arch.mjs enforces that mechanically.

export { createRng, type Rng } from './rng.ts';
export { simulateGame } from './simulateGame.ts';
export { unitRatings, groupRating, type UnitRatings } from './ratings.ts';
export { createRuntime, type TeamRuntime } from './roster.ts';
export { CALIBRATION } from './calibration.ts';
export { fieldGoalProbability, weatherPenalty } from './plays.ts';
export { runShare, chooseFourthDown, fieldGoalDistance, type Situation } from './playcall.ts';
export { teamStateFor, teamStatesFor, type BridgeOptions } from './careerBridge.ts';
export {
  buildSchedule, simulateSeason, type Fixture, type SeasonOptions, type SeasonResult,
  type TeamRecord,
} from './season.ts';
export * from './types.ts';
