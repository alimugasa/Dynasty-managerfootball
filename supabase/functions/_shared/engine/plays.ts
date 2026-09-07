// Resolution of a single snap.
//
// The rate formulas are the reference engine's, applied per play instead of once
// per team per game. Sack rate, completion percentage, yards per attempt,
// interception rate and yards per carry are all linear in the unit-rating
// differential and then clamped, exactly as in legacy/engine/season.py; what is
// new here is the yardage *distribution* behind each rate, which a box-score
// generator does not need and a play-level engine does.

import { CALIBRATION, clamp } from './calibration.ts';
import { fieldableIn, starterOf, type TeamRuntime } from './roster.ts';
import type { UnitRatings } from './ratings.ts';
import type { Rng } from './rng.ts';
import type { EnginePlayer, PlayOutcome, Weather } from './types.ts';

export interface PlayResolution {
  readonly outcome: PlayOutcome;
  readonly yards: number;
  readonly clockStops: boolean;
  readonly turnover: boolean;
  readonly wasSack: boolean;
  readonly passer?: EnginePlayer;
  readonly rusher?: EnginePlayer;
  readonly receiver?: EnginePlayer;
  readonly defender?: EnginePlayer;
  readonly kicker?: EnginePlayer;
}

/** Combined weather drag, matching the reference engine's wind penalty term. */
export function weatherPenalty(weather: Weather): number {
  return weather.wind / 100 + weather.precipitation * 0.25 + weather.cold * 0.15;
}

function weightedPick(
  candidates: readonly EnginePlayer[],
  weights: readonly number[],
  rng: Rng,
): EnginePlayer | undefined {
  let total = 0;
  const usable = Math.min(candidates.length, weights.length);
  for (let i = 0; i < usable; i += 1) total += weights[i] ?? 0;
  if (total <= 0) return candidates[0];
  let roll = rng.float() * total;
  for (let i = 0; i < usable; i += 1) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) return candidates[i];
  }
  return candidates[usable - 1];
}

/** Who gets the carry. The lead back takes most of it, with real rotation. */
function chooseRusher(runtime: TeamRuntime, rng: Rng): EnginePlayer {
  const backs = fieldableIn(runtime, 'RB');
  const picked = weightedPick(backs, [0.66, 0.26, 0.08], rng);
  return picked ?? starterOf(runtime, 'RB');
}

/** Who the ball goes to. Shares are across the receiver corps, tight end and
 *  backs, which is what keeps a team's leading receiver a receiver. */
function chooseReceiver(runtime: TeamRuntime, rng: Rng): EnginePlayer {
  const wide = fieldableIn(runtime, 'WR');
  const tight = fieldableIn(runtime, 'TE');
  const backs = fieldableIn(runtime, 'RB');
  const pool: EnginePlayer[] = [];
  const weights: number[] = [];
  const wideShares = [0.27, 0.21, 0.13];
  for (let i = 0; i < Math.min(wide.length, 3); i += 1) {
    const player = wide[i];
    if (player !== undefined) {
      pool.push(player);
      weights.push(wideShares[i] ?? 0.05);
    }
  }
  const te = tight[0];
  if (te !== undefined) { pool.push(te); weights.push(0.19); }
  const rb = backs[0];
  if (rb !== undefined) { pool.push(rb); weights.push(0.14); }
  const picked = weightedPick(pool, weights, rng);
  return picked ?? starterOf(runtime, 'WR');
}

/** Which defender is credited. Coverage players on passes, front seven on runs. */
function chooseDefender(runtime: TeamRuntime, againstRun: boolean, rng: Rng): EnginePlayer {
  const groups = againstRun
    ? [...fieldableIn(runtime, 'LB'), ...fieldableIn(runtime, 'DT'), ...fieldableIn(runtime, 'S')]
    : [...fieldableIn(runtime, 'CB'), ...fieldableIn(runtime, 'S'), ...fieldableIn(runtime, 'LB')];
  const picked = weightedPick(groups, [0.3, 0.22, 0.18, 0.14, 0.09, 0.07], rng);
  return picked ?? starterOf(runtime, againstRun ? 'LB' : 'CB');
}

export function resolveRun(
  offense: TeamRuntime,
  defense: TeamRuntime,
  units: { readonly offense: UnitRatings; readonly defense: UnitRatings },
  homeFieldRun: number,
  rng: Rng,
): PlayResolution {
  const { run } = CALIBRATION;
  const diff = units.offense.runOffense - units.defense.runDefense + homeFieldRun;
  const rusher = chooseRusher(offense, rng);
  const defender = chooseDefender(defense, true, rng);

  const stuffShare = clamp(run.stuffShareBase + run.stuffSharePerDiff * diff, 0.04, 0.34);
  const targetYpc = clamp(
    run.yardsPerCarryBase + run.yardsPerCarryPerDiff * diff,
    run.yardsPerCarryMin,
    run.yardsPerCarryMax,
  );

  // Mean of the positive branch is solved from the target so the distribution
  // can be reshaped without breaking the calibrated average.
  const breakContribution = run.breakawayShare * run.breakawayMeanExtra;
  const negativeContribution = stuffShare * -run.stuffMeanLoss;
  const positiveMean =
    (targetYpc - breakContribution - negativeContribution) / (1 - stuffShare) - 1;
  const tailMean = positiveMean < 0.5 ? 0.5 : positiveMean;

  let yards: number;
  if (rng.chance(stuffShare)) {
    yards = Math.round(rng.normal(-run.stuffMeanLoss, run.stuffSdLoss));
    yards = clamp(yards, -9, 1);
  } else {
    yards = Math.round(1 + rng.exponential(tailMean));
    if (rng.chance(run.breakawayShare)) yards += Math.round(rng.exponential(run.breakawayMeanExtra));
  }

  if (rng.chance(run.fumbleRate)) {
    return {
      outcome: 'fumble', yards, clockStops: true, turnover: true, wasSack: false,
      rusher, defender,
    };
  }

  return {
    outcome: 'gain',
    yards,
    clockStops: rng.chance(run.outOfBoundsShare),
    turnover: false,
    wasSack: false,
    rusher,
    defender,
  };
}

export function resolvePass(
  offense: TeamRuntime,
  defense: TeamRuntime,
  units: { readonly offense: UnitRatings; readonly defense: UnitRatings },
  homeFieldPass: number,
  weather: Weather,
  rng: Rng,
): PlayResolution {
  const { pass } = CALIBRATION;
  const diff = units.offense.passOffense - units.defense.passDefense + homeFieldPass;
  // Protection is its own matchup: a hurt tackle should raise the sack rate
  // without making the quarterback less accurate.
  const protectionDiff = units.offense.passProtection - units.defense.passRush + homeFieldPass;
  const penalty = weatherPenalty(weather);
  const passer = starterOf(offense, 'QB');

  const sackRate = clamp(
    pass.sackRateBase + pass.sackRatePerDiff * protectionDiff,
    pass.sackRateMin,
    pass.sackRateMax,
  );
  if (rng.chance(sackRate)) {
    const loss = Math.round(1 + rng.exponential(pass.sackMeanLoss));
    return {
      outcome: 'sack',
      yards: -clamp(loss, 1, pass.sackMaxLoss),
      clockStops: false,
      turnover: false,
      wasSack: true,
      passer,
      defender: chooseDefender(defense, false, rng),
    };
  }

  if (rng.chance(pass.scrambleRate)) {
    const yards = Math.round(rng.exponential(pass.scrambleMeanYards));
    return {
      outcome: 'scramble', yards, clockStops: rng.chance(0.3), turnover: false,
      wasSack: false, passer, rusher: passer, defender: chooseDefender(defense, true, rng),
    };
  }

  const receiver = chooseReceiver(offense, rng);
  const defender = chooseDefender(defense, false, rng);

  const interceptionRate = clamp(
    pass.interceptionBase + pass.interceptionPerDiff * diff + penalty * pass.interceptionWindPenalty,
    pass.interceptionMin,
    pass.interceptionMax,
  );
  if (rng.chance(interceptionRate)) {
    return {
      outcome: 'interception', yards: 0, clockStops: true, turnover: true,
      wasSack: false, passer, receiver, defender,
    };
  }

  const completionRate = clamp(
    pass.completionBase + pass.completionPerDiff * diff - penalty * pass.completionWindPenalty,
    pass.completionMin,
    pass.completionMax,
  );
  if (!rng.chance(completionRate)) {
    return {
      outcome: 'incomplete', yards: 0, clockStops: true, turnover: false,
      wasSack: false, passer, receiver, defender,
    };
  }

  // Deep shots are rarer in wind, which is why the penalty appears here as well
  // as in the completion rate.
  const deepShare = clamp(
    pass.deepShare + pass.deepSharePerDiff * diff - penalty * 0.06, 0.03, 0.3,
  );
  const shortMean = clamp(pass.shortMeanYards + pass.shortMeanPerDiff * diff, 3, 14);
  let yards: number;
  if (rng.chance(deepShare)) {
    yards = Math.round(rng.normal(pass.deepMeanYards, pass.deepSdYards));
    if (yards < 9) yards = 9;
  } else {
    yards = Math.round(1 + rng.exponential(shortMean));
  }

  return {
    outcome: 'gain', yards, clockStops: rng.chance(pass.outOfBoundsShare),
    turnover: false, wasSack: false, passer, receiver, defender,
  };
}

/** Logistic in distance, so accuracy degrades smoothly rather than at a cliff. */
export function fieldGoalProbability(
  distance: number,
  kicker: EnginePlayer,
  weather: Weather,
): number {
  const { kicking } = CALIBRATION;
  if (distance > kicking.fieldGoalMaxDistance) return 0;
  const accuracy = kicker.ratings.kickAccuracy ?? kicker.ratings.overall;
  const pivot = kicking.fieldGoalBaseDistance + (accuracy - 70) * 0.13;
  const raw = 1 / (1 + Math.exp(kicking.fieldGoalSlope * (distance - pivot)));
  return clamp(raw - weatherPenalty(weather) * kicking.fieldGoalWindPenalty * distance * 0.1, 0.01, 0.995);
}

export function resolveFieldGoal(
  offense: TeamRuntime,
  distance: number,
  weather: Weather,
  rng: Rng,
): PlayResolution {
  const kicker = starterOf(offense, 'K');
  const good = rng.chance(fieldGoalProbability(distance, kicker, weather));
  return {
    outcome: good ? 'fieldGoalGood' : 'fieldGoalMissed',
    yards: 0, clockStops: true, turnover: !good, wasSack: false, kicker,
  };
}

export function resolvePunt(
  offense: TeamRuntime,
  yardLine: number,
  weather: Weather,
  rng: Rng,
): { readonly resolution: PlayResolution; readonly nextYardLine: number } {
  const { kicking } = CALIBRATION;
  const punter = starterOf(offense, 'P');
  const power = punter.ratings.puntPower ?? punter.ratings.overall;
  const mean = kicking.puntMeanYards + (power - 70) * 0.12 - weatherPenalty(weather) * 3;
  const gross = Math.round(clamp(rng.normal(mean, kicking.puntSdYards), 18, 75));
  const landing = yardLine + gross;

  // Into the end zone is a touchback to the twenty; otherwise the receiving team
  // takes over where it was downed, measured from their own goal line.
  const nextYardLine = landing >= 100
    ? 100 - CALIBRATION.drive.touchbackYardLine + 5
    : clamp(100 - landing, 1, 99);

  return {
    resolution: {
      outcome: landing >= 100 ? 'touchback' : 'punt',
      yards: gross, clockStops: true, turnover: true, wasSack: false, kicker: punter,
    },
    nextYardLine,
  };
}
