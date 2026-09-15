// Season grades.
//
// A grade is what a player did, not what he is. It is generated from a per-season
// "form" draw that ability tilts but does not determine, exactly as the reference
// engine does it, and deliberately NOT from the box score: an offensive lineman
// accumulates no statistics and still has a season, and a quarterback on a bad
// team can throw for a great deal while playing badly.
//
// Ability is standardised across the graded population each season before it is
// mixed in, so the mixing weight is the correlation, and grades stay comparable
// across eras even as the league's absolute level moves.

import { OFFSEASON } from './calibration.ts';
import { clamp } from '../calibration.ts';
import type { Rng } from '../rng.ts';
import type { CareerPlayer, SeasonGrade } from './types.ts';

/** Published grade from a standardised score. Linear through the middle,
 *  compressed above the knee so that a historic season stays distinguishable
 *  from a merely excellent one instead of both landing on the ceiling. */
export function gradeFromZ(z: number): number {
  const g = OFFSEASON.grading;
  const raw = g.gradeMean + g.gradeSd * z;
  const compressed = raw > g.gradeKnee ? g.gradeKnee + (raw - g.gradeKnee) * g.gradeKneeSlope : raw;
  return clamp(compressed, g.gradeMin, g.gradeMax);
}

/** Ability as the grading model sees it: on-field ability plus what experience
 *  has added. */
export function effectiveAbility(player: CareerPlayer): number {
  return player.ability + player.mental;
}

export interface GradingPopulation {
  readonly mean: number;
  readonly sd: number;
}

/** Ability distribution of the players being graded. Recomputed each season so
 *  the grade scale does not drift with the league's absolute level. */
export function gradingPopulation(players: readonly CareerPlayer[]): GradingPopulation {
  if (players.length === 0) return { mean: 0, sd: 1 };
  let sum = 0;
  for (const player of players) sum += effectiveAbility(player);
  const mean = sum / players.length;

  let variance = 0;
  for (const player of players) {
    const d = effectiveAbility(player) - mean;
    variance += d * d;
  }
  const sd = Math.sqrt(variance / players.length);
  // A league of identical players would divide by zero; grade them all average.
  return { mean, sd: sd < 1e-6 ? 1 : sd };
}

/**
 * One season's form. Ability tilts it; it does not decide it.
 *
 * form = w * abilityZ + sqrt(1 - w^2) * noise
 *
 * With abilityZ standardised, the two terms have unit variance and the weight
 * is exactly the correlation between ability and form. Writing the noise
 * coefficient as sqrt(1 - w^2) rather than (1 - w) keeps form itself at unit
 * variance, so the grade scale does not stretch or shrink when the weight is
 * retuned.
 */
export function seasonForm(player: CareerPlayer, population: GradingPopulation, rng: Rng): number {
  const w = OFFSEASON.grading.abilityWeight;
  const abilityZ = (effectiveAbility(player) - population.mean) / population.sd;
  return w * abilityZ + Math.sqrt(1 - w * w) * rng.normal(0, 1);
}

/**
 * Grade a whole season.
 *
 * Per-game noise is averaged over the games actually played, so a player who
 * missed most of the year carries more noise in his grade than one who played
 * every week. That is true of real grading and it matters here: it means a small
 * sample is genuinely less reliable rather than merely flagged as such.
 */
export function gradeSeason(
  players: readonly CareerPlayer[],
  rng: Rng,
  season: number,
): SeasonGrade[] {
  const g = OFFSEASON.grading;
  const population = gradingPopulation(players);
  const grades: SeasonGrade[] = [];

  for (const player of players) {
    const played = Math.max(1, g.gamesPerSeason - player.gamesMissedSeason);
    const form = seasonForm(player, population, rng);
    // Mean of `played` independent per-game draws.
    const sampling = rng.normal(0, g.perGameNoiseSd / Math.sqrt(played));
    const gradeZ = form + sampling;
    grades.push({
      playerId: player.id,
      season,
      ability: player.ability,
      grade: gradeFromZ(gradeZ),
      gradeZ,
      snaps: played,
    });
  }
  return grades;
}

/** Pearson correlation, used by the tests that hold the decoupling in place. */
export function correlation(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) { sx += xs[i] as number; sy += ys[i] as number; }
  const mx = sx / n;
  const my = sy / n;

  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  return vx === 0 || vy === 0 ? NaN : cov / Math.sqrt(vx * vy);
}
