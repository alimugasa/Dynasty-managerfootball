// Signing a man in November.
//
// The cases here are the ones a manager would argue about: the thirty-four
// year old who will take one year, the good player asked to join a bad club,
// the offer that is nearly enough. Each is a claim the request makes in
// words, and each would be invisible if it were wrong -- a market that quietly
// says yes to everything looks exactly like a market that works.

import { describe, expect, it } from 'vitest';
import {
  ACCEPT_THRESHOLD, COUNTER_THRESHOLD, answerOffer, closingAav, cpuOffer,
  desiredLength, inSeasonAsk, replacementScore, signingProbability,
  type ClubOffer, type MarketPlayer,
} from '../../supabase/functions/_shared/api/inSeasonMarket';
import { FA_PERSONALITIES } from '../../supabase/functions/_shared/engine/offseason/types';

const SEASON_WEEKS = 18;
const MINIMUM = 1_000_000;

const player = (over: Partial<MarketPlayer> = {}): MarketPlayer => ({
  playerId: 'p1', name: 'A Player', position: 'WR',
  age: 27, overall: 72, potential: 76, experienceYears: 5,
  askingAav: 6_000_000, expectedYears: 3, desiredRole: 'ROTATION',
  personality: 'MAX_MONEY', previousTeamId: null,
  ...over,
});

const offer = (over: Partial<ClubOffer> = {}): ClubOffer => ({
  teamId: 't1', aav: 6_000_000, years: 3, role: 'ROTATION',
  need: 0.5, contention: 0.5, capSpace: 40_000_000,
  ...over,
});

describe('what a player asks for mid-season', () => {
  it('asks for less the later it gets', () => {
    const p = player();
    const early = inSeasonAsk(p, 2, SEASON_WEEKS, MINIMUM);
    const late = inSeasonAsk(p, 14, SEASON_WEEKS, MINIMUM);
    expect(late).toBeLessThan(early);
    expect(early).toBeLessThan(p.askingAav);
  });

  it('never goes below the minimum, however late', () => {
    const fringe = player({ askingAav: 900_000 });
    expect(inSeasonAsk(fringe, SEASON_WEEKS, SEASON_WEEKS, MINIMUM)).toBe(MINIMUM);
  });

  it('charges more than the arithmetic for a player signed for a playoff run', () => {
    // Half the season left is not half the money: a club signing in week 10 is
    // buying January as much as it is buying ten Sundays.
    const p = player();
    const half = inSeasonAsk(p, 10, SEASON_WEEKS, MINIMUM);
    expect(half).toBeGreaterThan(p.askingAav * 0.5);
  });
});

describe('how long he wants', () => {
  it('gives an older veteran the short deal', () => {
    expect(desiredLength(player({ age: 34, expectedYears: 3 }))).toBe(1);
    expect(desiredLength(player({ age: 30, expectedYears: 4 }))).toBe(2);
  });

  it('gives a young player the years, whatever the market says', () => {
    expect(desiredLength(player({ age: 23, experienceYears: 1, expectedYears: 1 }))).toBe(2);
  });

  it('leaves a player in his prime with what the market gives him', () => {
    expect(desiredLength(player({ age: 26, experienceYears: 5, expectedYears: 4 }))).toBe(4);
  });
});

describe('whether he signs', () => {
  it('takes a full offer from a club that wants him', () => {
    const p = player();
    const ask = inSeasonAsk(p, 6, SEASON_WEEKS, MINIMUM);
    expect(answerOffer(p, offer({ aav: ask }), ask).kind).toBe('ACCEPTED');
  });

  it('refuses an insulting offer and says which insult it was', () => {
    const p = player();
    const ask = inSeasonAsk(p, 6, SEASON_WEEKS, MINIMUM);
    const verdict = answerOffer(p, offer({ aav: Math.round(ask * 0.2), need: 0, contention: 0.1 }), ask);
    expect(verdict.kind).toBe('REJECTED');
    if (verdict.kind !== 'REJECTED') throw new Error('unreachable');
    expect(verdict.reason).toBe('Nowhere near what he is asking');
  });

  it('will not sign a good player to a club going nowhere at the going rate', () => {
    // The request's own case. Stated as a penalty rather than a refusal: a
    // weak club can still have him, and has to pay for the privilege.
    const star = player({ overall: 84, personality: 'CHAMPIONSHIP' });
    const ask = inSeasonAsk(star, 6, SEASON_WEEKS, MINIMUM);
    const toWeak = answerOffer(star, offer({ aav: ask, contention: 0.1 }), ask);
    expect(toWeak.kind).not.toBe('ACCEPTED');

    const toContender = answerOffer(star, offer({ aav: ask, contention: 0.9 }), ask);
    expect(toContender.kind).toBe('ACCEPTED');
  });

  it('can be bought out of that objection', () => {
    const star = player({ overall: 84, personality: 'MAX_MONEY' });
    const ask = inSeasonAsk(star, 6, SEASON_WEEKS, MINIMUM);
    const weak = offer({ contention: 0.1, capSpace: 90_000_000 });
    expect(answerOffer(star, { ...weak, aav: ask }, ask).kind).not.toBe('ACCEPTED');
    expect(answerOffer(star, { ...weak, aav: ask * 2 }, ask).kind).toBe('ACCEPTED');
  });

  it('counters rather than refusing when a number would still close it', () => {
    // The offer that is nearly enough. "No" here would be a dead end wearing a
    // decision, and the manager could not tell it from a real one.
    const p = player({ personality: 'MAX_MONEY' });
    const ask = inSeasonAsk(p, 6, SEASON_WEEKS, MINIMUM);
    const verdict = answerOffer(p, offer({ aav: Math.round(ask * 0.72), need: 0.2 }), ask);
    expect(verdict.kind).toBe('COUNTERED');
    if (verdict.kind !== 'COUNTERED') throw new Error('unreachable');
    // A counter a manager can act on: more than was offered, and a number he
    // actually takes. Not necessarily more than his asking price -- a player
    // who is getting the role he wants signs below his ask, and an earlier
    // version of this padded every counter up to the ask for no reason except
    // that the arithmetic was a nudge rather than a solution.
    expect(verdict.aav).toBeGreaterThan(Math.round(ask * 0.72));
    expect(answerOffer(p, offer({ aav: verdict.aav, need: 0.2 }), ask).kind).toBe('ACCEPTED');
    expect(verdict.years).toBe(desiredLength(p));
  });

  it('counters at a number the player would actually accept', () => {
    // The counter is only useful if meeting it works. This is the loop a
    // manager will run, so it is the loop the test runs.
    const p = player({ personality: 'MAX_MONEY' });
    const ask = inSeasonAsk(p, 6, SEASON_WEEKS, MINIMUM);
    const first = answerOffer(p, offer({ aav: Math.round(ask * 0.72), need: 0.2 }), ask);
    expect(first.kind).toBe('COUNTERED');
    if (first.kind !== 'COUNTERED') throw new Error('unreachable');
    const second = answerOffer(p, offer({ aav: first.aav, need: 0.2 }), ask);
    expect(second.kind).toBe('ACCEPTED');
  });

  it('lets a player who wants to play sign for less to play', () => {
    // Written first as a counter, which it is not: a man whose whole
    // preference is snaps, offered the starting job, takes three quarters of
    // his ask for it. That is the personality weighting doing its work, and it
    // is a discount a manager can find on purpose.
    const p = player({ personality: 'ROLE', desiredRole: 'STARTER' });
    const ask = inSeasonAsk(p, 6, SEASON_WEEKS, MINIMUM);
    expect(answerOffer(p, offer({ aav: Math.round(ask * 0.75), role: 'STARTER' }), ask).kind)
      .toBe('ACCEPTED');
    // The same money without the job is not enough.
    expect(answerOffer(p, offer({ aav: Math.round(ask * 0.75), role: 'DEPTH', need: 0.1 }), ask).kind)
      .not.toBe('ACCEPTED');
  });

  it('refuses a deal the club cannot carry before weighing anything else', () => {
    const p = player();
    const ask = inSeasonAsk(p, 6, SEASON_WEEKS, MINIMUM);
    const verdict = answerOffer(p, offer({ aav: ask * 3, capSpace: 500_000 }), ask);
    expect(verdict.kind).toBe('REJECTED');
    if (verdict.kind !== 'REJECTED') throw new Error('unreachable');
    expect(verdict.reason).toContain('cap');
  });

  it('weighs what each kind of player says he weighs', () => {
    const ask = 5_000_000;
    const rich = offer({ aav: 9_000_000, contention: 0.1, role: 'DEPTH', need: 0.1 });
    const winner = offer({ aav: 3_000_000, contention: 0.95, role: 'DEPTH', need: 0.1 });
    const money = player({ personality: 'MAX_MONEY' });
    const ring = player({ personality: 'CHAMPIONSHIP' });
    expect(signingProbability(money, rich, ask))
      .toBeGreaterThan(signingProbability(money, winner, ask));
    expect(signingProbability(ring, winner, ask))
      .toBeGreaterThan(signingProbability(ring, rich, ask));
  });

  it('values playing time to a player who wants to play', () => {
    // The request's young-free-agent case: snaps, not money.
    const young = player({
      personality: 'ROLE', desiredRole: 'STARTER', age: 24, experienceYears: 2,
    });
    const ask = 4_000_000;
    const starting = signingProbability(young, offer({ aav: ask, role: 'STARTER', need: 0.2 }), ask);
    const buried = signingProbability(young, offer({ aav: ask, role: 'DEPTH', need: 0.2 }), ask);
    expect(starting).toBeGreaterThan(buried);
  });

  it('counts a return to his old club for the kind of player that counts it', () => {
    const ask = 4_000_000;
    const loyal = player({ personality: 'LOYALTY', previousTeamId: 'home' });
    expect(signingProbability(loyal, offer({ teamId: 'home', aav: ask }), ask))
      .toBeGreaterThan(signingProbability(loyal, offer({ teamId: 'away', aav: ask }), ask));
  });

  it('keeps the probability on the scale whatever is thrown at it', () => {
    const p = player({ overall: 99 });
    expect(signingProbability(p, offer({ aav: 500_000_000, contention: 1, need: 1 }), 1_000_000))
      .toBeLessThanOrEqual(1);
    expect(signingProbability(p, offer({ aav: 0, contention: 0, need: 0, role: 'DEPTH' }), 1_000_000))
      .toBeGreaterThanOrEqual(0);
  });

  it('leaves no gap between the three answers', () => {
    expect(COUNTER_THRESHOLD).toBeLessThan(ACCEPT_THRESHOLD);
  });

  it('never counters with a number that would not close it', () => {
    // The guarantee the counter exists for, over every kind of player and a
    // spread of clubs. A counter that is not closable is a refusal wearing a
    // suggestion, and a manager cannot tell the difference without playing it
    // out -- which is exactly how this was found, in an end-to-end run where
    // meeting the counter produced the same counter again.
    for (const personality of FA_PERSONALITIES) {
      for (const contention of [0, 0.25, 0.5, 0.9]) {
        for (const overall of [64, 80]) {
          for (const role of ['STARTER', 'ROTATION', 'DEPTH'] as const) {
            const p = player({ personality, overall, desiredRole: 'STARTER' });
            const ask = 5_000_000;
            const base = offer({
              aav: Math.round(ask * 0.5), role, contention,
              need: 0.2, capSpace: 400_000_000,
            });
            const first = answerOffer(p, base, ask);
            if (first.kind !== 'COUNTERED') continue;
            const met = answerOffer(p, { ...base, aav: first.aav }, ask);
            expect(met.kind,
              `${personality} @${String(contention)} ${role} ${String(overall)}`)
              .toBe('ACCEPTED');
          }
        }
      }
    }
  });

  it('says no rather than naming a number when no number would do', () => {
    // A club out of the race, offering a bench role to somebody who wants to
    // start and wants a ring. There is no salary that fixes that, and saying
    // so is more use than a counter he would refuse.
    const p = player({ personality: 'CHAMPIONSHIP', overall: 86, desiredRole: 'STARTER' });
    const hopeless = offer({ contention: 0, role: 'DEPTH', need: 0, capSpace: 900_000_000 });
    expect(closingAav(p, hopeless, 5_000_000)).toBeNull();
    const verdict = answerOffer(p, { ...hopeless, aav: 50_000_000 }, 5_000_000);
    expect(verdict.kind).toBe('REJECTED');
    if (verdict.kind !== 'REJECTED') throw new Error('unreachable');
    expect(verdict.reason).toContain('No money closes this');
  });
});

describe('what a computer-run club offers', () => {
  it('pays over the odds for a position it badly needs', () => {
    const desperate = cpuOffer(5_000_000, 1, 40_000_000, MINIMUM);
    const comfortable = cpuOffer(5_000_000, 0, 40_000_000, MINIMUM);
    expect(desperate).not.toBeNull();
    expect(comfortable).not.toBeNull();
    expect(desperate ?? 0).toBeGreaterThan(comfortable ?? 0);
    expect(desperate ?? 0).toBeGreaterThan(5_000_000);
  });

  it('stays out of the market with no room', () => {
    expect(cpuOffer(5_000_000, 1, 400_000, MINIMUM)).toBeNull();
  });

  it('never commits its whole room to one player', () => {
    const made = cpuOffer(40_000_000, 1, 10_000_000, MINIMUM);
    expect(made ?? 0).toBeLessThan(10_000_000);
  });

  it('walks away rather than offering less than a player can be paid', () => {
    // A club with room for exactly the minimum and a ceiling below it makes no
    // offer at all, instead of one nobody is allowed to sign.
    expect(cpuOffer(20_000_000, 1, 1_200_000, MINIMUM)).toBeNull();
  });
});

describe('who a club goes after', () => {
  const veteran = { overall: 76, potential: 76, age: 30, experienceYears: 9 };
  const prospect = { overall: 68, potential: 84, age: 23, experienceYears: 1 };

  it('sends a contender after the man who has done it before', () => {
    expect(replacementScore(veteran, true)).toBeGreaterThan(replacementScore(prospect, true));
  });

  it('sends a rebuilding club after the young one', () => {
    expect(replacementScore(prospect, false)).toBeGreaterThan(replacementScore(veteran, false));
  });

  it('still lets a rebuilding club take the best player when there is no young one', () => {
    // A rebuild is a preference, not a rule against good players: between two
    // players of the same age and upside, it takes the better one.
    const better = { overall: 78, potential: 82, age: 24, experienceYears: 2 };
    const worse = { overall: 62, potential: 66, age: 24, experienceYears: 2 };
    expect(replacementScore(better, false)).toBeGreaterThan(replacementScore(worse, false));
  });
});
