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
export { buildIndex, type RosterIndex } from './rosterIndex.ts';
export {
  enforceCompliance, primePipeline, runOffseason, type OffseasonResult,
} from './population.ts';
export {
  freeAgents, meanRosteredAbility, meanRosteredAge, prospectToPlayer, rosteredPlayers,
  rosterOf, rosterValue, ROSTER_QUOTA, ROSTER_SIZE, OFFSEASON_QUOTA,
  OFFSEASON_ROSTER_LIMIT,
  type League,
} from './league.ts';
export {
  addressedNeed, addressedTopNeed, buildBoard, DRAFT, rankOfNeed, runDraft, strengthOrder,
  type DraftPick, type DraftResult,
} from './draft.ts';
export {
  FREE_AGENCY, offerFrom, PERSONALITY_WEIGHTS, runFreeAgency, scoreOffer,
  type Bid, type FreeAgencyResult, type Signing,
} from './freeAgency.ts';
export {
  allocateScouting, SCOUTING, scoutClass, scoutProspect, scoutingSigma,
  type ScoutingReport,
} from './scouting.ts';
export {
  capSavings, capSheet, contractEfficiency, cutAppeal, deadMoneyIfCut, expireContracts,
  MAX_DEAD_MONEY_SHARE,
  marketValue,
  MAX_AAV_SHARE, perceivedValue, rookieContract, veteranContract, type CapSheet,
} from './contracts.ts';
export { FA_PERSONALITIES } from './types.ts';
export type {
  CareerAccolades, CareerPlayer, DevelopmentOutcome, FaPersonality, OffseasonSummary,
  PlayerContract, Prospect, SeasonGrade,
} from './types.ts';
export { capRules, defaultFront, type CapRules, type TeamFront } from './frontOffice.ts';
export {
  POSITION_VALUE, STARTERS, saturated, teamNeeds, type TeamNeeds,
} from './needs.ts';
