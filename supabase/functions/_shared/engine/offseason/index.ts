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
  campStage, draftStage, marketStage, primePipeline, runOffseason, settleSeason,
  type DraftStageOptions, type OffseasonInput, type OffseasonResult, type SettleResult,
} from './population.ts';
export { enforceCompliance, type Release } from './compliance.ts';
export {
  CAROUSEL, expectedWins, generateCoach, retirementChance, runCarousel, seatAfter,
  type CarouselResult, type CoachMove, type CoachMoveKind, type CoachRecord,
} from './carousel.ts';
export {
  AWARD_CODES, AWARD_NAME, BALLOT_DEPTH, runAwards, selectHonours, voterScore,
  type Award, type AwardCandidate, type AwardCode, type AwardResult, type Ballot,
  type CoachCandidate, type Honour, type HonourTeam,
} from './awards.ts';
export {
  freeAgents, meanRosteredAbility, meanRosteredAge, prospectToPlayer, rosteredPlayers,
  rosterOf, rosterValue, ROSTER_QUOTA, ROSTER_SIZE, OFFSEASON_QUOTA,
  OFFSEASON_ROSTER_LIMIT,
  type League,
} from './league.ts';
export {
  addressedNeed, addressedTopNeed, buildBoard, DRAFT, rankOfNeed, runDraft, strengthOrder,
  type DraftChoices, type DraftOptions, type DraftPick, type DraftResult,
} from './draft.ts';
export {
  FREE_AGENCY, offerFrom, PERSONALITY_WEIGHTS, runFreeAgency, scoreOffer,
  type Bid, type FreeAgencyResult, type Signing, type UserOffer,
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
export {
  evaluateTrade, reSignAsk, reSignContract, releaseCost, tradeValue, TRADE_MARGIN,
  type TradeSide, type TradeVerdict,
} from './deals.ts';
export { FA_PERSONALITIES } from './types.ts';
export type {
  CareerAccolades, CareerPlayer, DevelopmentOutcome, FaPersonality, OffseasonSummary,
  PlayerContract, Prospect, SeasonGrade,
} from './types.ts';
export { capRules, defaultFront, type CapRules, type TeamFront } from './frontOffice.ts';
export {
  COACH_ROLES, COACH_TREES, coachingStateFor, coachInRole, developmentContext,
  developmentRating, employed, evaluationRating, headCoachOf, LEAGUE_AVERAGE_RATING,
  playingTimeFrom, ROLE_LABEL, staffOf, staffRating, unemployed,
  type CareerCoach, type CoachRole, type CoachTree,
} from './coaches.ts';
export {
  POSITION_VALUE, STARTERS, saturated, teamNeeds, type TeamNeeds,
} from './needs.ts';
