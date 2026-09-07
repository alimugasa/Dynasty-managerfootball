// Offseason subsystem: development, retirement, intake, grading, reputation.
//
// Pure, like the rest of the engine. Nothing here reads a clock, a database or
// the network, and every random decision comes from the Rng passed in.

export { OFFSEASON, PEAK_AGE, DECLINE_RATE, POSITION_CEILING, MENTAL_CAP } from './calibration.ts';
export { developAll, developPlayer, NEUTRAL_CONTEXT, type DevelopmentContext } from './development.ts';
export { retireAll, retirementHazard } from './retirement.ts';
export {
  classAllocation, CLASS_COMPOSITION, developProspects, gammaDeviate, generateClass,
  type IntakeConfig,
} from './draftClass.ts';
export {
  correlation, effectiveAbility, gradeFromZ, gradeSeason, gradingPopulation, seasonForm,
} from './grading.ts';
export {
  fillRosters, meanRosteredAbility, meanRosteredAge, primePipeline, ROSTER_QUOTA,
  ROSTER_SIZE, rosterOf, runOffseason, type League, type OffseasonResult,
} from './population.ts';
export type {
  CareerAccolades, CareerPlayer, DevelopmentOutcome, OffseasonSummary, Prospect, SeasonGrade,
} from './types.ts';
