// Injury rolls.
//
// Rolled per player per snap for everyone on the field, so a player who never
// leaves the field carries more risk than one who rotates -- and a tired player
// carries more than a fresh one. An injury removes the player from the game,
// which promotes his backup on the depth chart, which changes the unit ratings
// on the very next snap. That chain is the reason ratings are computed per snap
// rather than once at kickoff.

import { CALIBRATION } from './calibration.ts';
import { fatiguePenalty, sideline, type TeamRuntime } from './roster.ts';
import type { Rng } from './rng.ts';
import type { EnginePlayer, InjuryEvent, InjurySeverity, PlayType } from './types.ts';

function severityOf(rng: Rng): InjurySeverity {
  const { severityWeights } = CALIBRATION.injury;
  const roll = rng.float();
  if (roll < severityWeights.minor) return 'minor';
  if (roll < severityWeights.minor + severityWeights.shortTerm) return 'shortTerm';
  if (roll < severityWeights.minor + severityWeights.shortTerm + severityWeights.majorTerm) {
    return 'majorTerm';
  }
  return 'seasonEnding';
}

function weeksFor(severity: InjurySeverity, rng: Rng): number {
  const { shortTermWeeks, majorTermWeeks } = CALIBRATION.injury;
  switch (severity) {
    case 'minor':
      return 0;
    case 'shortTerm':
      return rng.int(shortTermWeeks[0], shortTermWeeks[1]);
    case 'majorTerm':
      return rng.int(majorTermWeeks[0], majorTermWeeks[1]);
    case 'seasonEnding':
      return 99;
  }
}

function riskMultiplier(playType: PlayType, wasSack: boolean): number {
  const { runPlayMultiplier, sackMultiplier } = CALIBRATION.injury;
  if (wasSack) return sackMultiplier;
  if (playType === 'run') return runPlayMultiplier;
  return 1;
}

/**
 * Roll every player on the field. Returns the first injury of the snap, if any.
 *
 * Only one injury per play is reported: two on the same snap is rare enough that
 * modelling it adds noise rather than fidelity, and stopping at the first keeps
 * the number of RNG draws a function of roster size alone.
 */
export function rollInjuries(
  runtime: TeamRuntime,
  onField: readonly EnginePlayer[],
  playType: PlayType,
  wasSack: boolean,
  rng: Rng,
): InjuryEvent | undefined {
  const { perSnapBase, durabilityPivot, durabilitySlope, fatigueMultiplier } =
    CALIBRATION.injury;
  const playRisk = riskMultiplier(playType, wasSack);

  let injured: EnginePlayer | undefined;
  for (const player of onField) {
    const durability = 1 + (durabilityPivot - player.durability) * durabilitySlope;
    const tired = 1 + (fatiguePenalty(runtime, player) / CALIBRATION.fatigue.maxPenalty) *
      fatigueMultiplier;
    const rate = perSnapBase * playRisk * (durability < 0.2 ? 0.2 : durability) * tired;
    // Every player draws, whether or not someone earlier was hurt, so the number
    // of draws on a snap does not depend on the outcome of a previous draw.
    const hit = rng.float() < rate;
    if (hit && injured === undefined) injured = player;
  }

  if (injured === undefined) return undefined;

  const severity = severityOf(rng);
  const weeksOut = weeksFor(severity, rng);
  const returnsThisGame = severity === 'minor' && rng.chance(0.55);
  if (!returnsThisGame) sideline(runtime, injured.id);

  return {
    playerId: injured.id,
    teamId: runtime.team.id,
    severity,
    weeksOut,
    returnsThisGame,
  };
}
