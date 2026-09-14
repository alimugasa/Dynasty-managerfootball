// Who chooses first.
//
// A waiver system is mostly one question asked twice: who is ahead of whom, and
// does being ahead still mean anything after you have used it. Both answers are
// rules, so both belong here rather than in a database test -- and the second
// one is the whole reason priority is a stored column instead of a query.

import { describe, expect, it } from 'vitest';
import {
  STANDINGS_MINIMUM_GAMES, WAIVER_WINDOW_WEEKS, awardClaim, deadlineFor,
  reorderAfterAward, waiverOrder, windowDue, windowOpen, type ClubStanding,
} from '../../supabase/functions/_shared/api/waiverRules';

const club = (over: Partial<ClubStanding> & { teamId: string }): ClubStanding => ({
  wins: 0, losses: 0, ties: 0, lastSeasonRank: null, ...over,
});

describe('waiver order', () => {
  it('puts the worst club first once the table means something', () => {
    const order = waiverOrder([
      club({ teamId: 'good', wins: 5, losses: 1 }),
      club({ teamId: 'bad', wins: 1, losses: 5 }),
      club({ teamId: 'middling', wins: 3, losses: 3 }),
    ]);
    expect(order).toEqual(['bad', 'middling', 'good']);
  });

  it('uses last season until every club has played enough', () => {
    // One game each. Nothing in this table separates anybody, and the records
    // that do exist point the other way from last season's finish -- which is
    // exactly the case where trusting them would be noise dressed as a rule.
    const order = waiverOrder([
      club({ teamId: 'champion', wins: 0, losses: 1, lastSeasonRank: 1 }),
      club({ teamId: 'cellar', wins: 1, losses: 0, lastSeasonRank: 32 }),
      club({ teamId: 'middle', wins: 1, losses: 0, lastSeasonRank: 16 }),
    ]);
    expect(order).toEqual(['cellar', 'middle', 'champion']);
  });

  it('switches to the table on the week every club reaches the minimum', () => {
    const played = (teamId: string, wins: number, rank: number): ClubStanding =>
      club({ teamId, wins, losses: STANDINGS_MINIMUM_GAMES - wins, lastSeasonRank: rank });
    // Last season's champion has lost them all; the cellar club has won them
    // all. The table now knows more than the record book does.
    expect(waiverOrder([
      played('champion', 0, 1),
      played('cellar', STANDINGS_MINIMUM_GAMES, 32),
    ])).toEqual(['champion', 'cellar']);

    // One game short on one club and last season decides again.
    expect(waiverOrder([
      club({ teamId: 'champion', wins: 0, losses: STANDINGS_MINIMUM_GAMES - 1, lastSeasonRank: 1 }),
      played('cellar', STANDINGS_MINIMUM_GAMES, 32),
    ])).toEqual(['cellar', 'champion']);
  });

  it('ranks by record rather than by wins alone', () => {
    // Same number of wins, different number of games. A 2-4 club is worse than
    // a 2-2 one and picks first.
    const order = waiverOrder([
      club({ teamId: 'fewer-games', wins: 2, losses: 2 }),
      club({ teamId: 'more-losses', wins: 2, losses: 4 }),
    ]);
    expect(order).toEqual(['more-losses', 'fewer-games']);
  });

  it('counts a tie as half a win', () => {
    const order = waiverOrder([
      club({ teamId: 'tied', wins: 2, losses: 3, ties: 1 }),
      club({ teamId: 'won', wins: 3, losses: 3 }),
    ]);
    expect(order).toEqual(['tied', 'won']);
  });

  it('sorts a club with no finish on record behind the ones that have one', () => {
    // An expansion club in a league's first season has not earned 32nd, so it
    // is not given it.
    const order = waiverOrder([
      club({ teamId: 'worst', lastSeasonRank: 32 }),
      club({ teamId: 'new', lastSeasonRank: null }),
      club({ teamId: 'best', lastSeasonRank: 1 }),
    ]);
    expect(order).toEqual(['worst', 'best', 'new']);
  });

  it('is stable and total when nothing separates two clubs', () => {
    const clubs = [club({ teamId: 'b' }), club({ teamId: 'a' }), club({ teamId: 'c' })];
    expect(waiverOrder(clubs)).toEqual(['a', 'b', 'c']);
    // And reordering the input does not reorder the output.
    expect(waiverOrder([...clubs].reverse())).toEqual(['a', 'b', 'c']);
  });

  it('answers an empty league with an empty queue', () => {
    expect(waiverOrder([])).toEqual([]);
  });
});

describe('awarding a claim', () => {
  const anyone = () => ({ eligible: true, reason: null });

  it('gives him to the best priority that claimed', () => {
    const result = awardClaim([
      { teamId: 'fifth', priorityAtClaim: 5 },
      { teamId: 'second', priorityAtClaim: 2 },
      { teamId: 'ninth', priorityAtClaim: 9 },
    ], anyone);
    expect(result.winner).toBe('second');
    expect(result.passed).toEqual([]);
  });

  it('settles on the priority in force when the claim was made', () => {
    // The point of storing priority_at_claim. A club that claimed on Tuesday
    // from third is not overtaken on Thursday by a result it had no part in.
    const result = awardClaim([
      { teamId: 'claimed-from-third', priorityAtClaim: 3 },
      { teamId: 'claimed-from-tenth', priorityAtClaim: 10 },
    ], anyone);
    expect(result.winner).toBe('claimed-from-third');
  });

  it('passes over a club that can no longer take him', () => {
    // A club at the front of the queue that has filled its last roster place
    // does not win him and block everybody behind it.
    const result = awardClaim([
      { teamId: 'full', priorityAtClaim: 1 },
      { teamId: 'broke', priorityAtClaim: 4 },
      { teamId: 'able', priorityAtClaim: 7 },
    ], (teamId) => teamId === 'able'
      ? { eligible: true, reason: null }
      : { eligible: false, reason: 'No roster space' });
    expect(result.winner).toBe('able');
    // In queue order, so the losing notices go out in the order they were
    // considered rather than the order they were submitted.
    expect(result.passed).toEqual(['full', 'broke']);
  });

  it('clears a player nobody eligible claimed', () => {
    const result = awardClaim(
      [{ teamId: 'full', priorityAtClaim: 1 }],
      () => ({ eligible: false, reason: 'No roster space' }),
    );
    expect(result.winner).toBeNull();
    expect(result.passed).toEqual(['full']);
  });

  it('clears a player nobody claimed at all', () => {
    const result = awardClaim([], anyone);
    expect(result.winner).toBeNull();
    expect(result.passed).toEqual([]);
  });
});

describe('priority after an award', () => {
  it('sends the winner to the back and leaves the rest in order', () => {
    expect(reorderAfterAward(['a', 'b', 'c', 'd'], 'b')).toEqual(['a', 'c', 'd', 'b']);
  });

  it('stops one club taking everything it wants all season', () => {
    // Three players off the wire, claimed by the same club every time. Without
    // the reorder it would still be first in the queue at the end of it.
    let order: readonly string[] = ['greedy', 'b', 'c'];
    for (let i = 0; i < 3; i += 1) order = reorderAfterAward(order, 'greedy');
    expect(order[0]).toBe('b');
    expect(order.at(-1)).toBe('greedy');
  });

  it('leaves the queue alone when the winner is not in it', () => {
    const order = ['a', 'b'];
    expect(reorderAfterAward(order, 'elsewhere')).toEqual(order);
  });
});

describe('the window', () => {
  // Written against the constant rather than against the number it currently
  // holds. The window is the one thing here the request calls configurable, so
  // a test that hard-codes two weeks fails the next time somebody configures
  // it -- and would be reporting its own staleness as a defect in the rules.
  it('takes claims for the configured number of weeks and then stops', () => {
    const posted = 6;
    const deadline = deadlineFor(posted);
    expect(deadline).toBe(posted + WAIVER_WINDOW_WEEKS);
    // Claimable from the week he was cut in up to the week before settlement.
    for (let week = posted; week < deadline; week += 1) {
      expect(windowOpen(deadline, week), `week ${String(week)}`).toBe(true);
    }
    // And not in the week it is settled: by the time that week is played the
    // award has already been made, so a claim then would be a claim on a
    // player who already has a club.
    expect(windowOpen(deadline, deadline)).toBe(false);
    expect(windowOpen(deadline, deadline + 1)).toBe(false);
  });

  it('settles at the top of the deadline week, so a claimed player plays in it', () => {
    // This was written the other way round first -- the window stayed open
    // through the deadline week and was settled after it -- and a player cut
    // in week 5 then sat unusable through two Sundays. Nobody would claim a
    // player on those terms.
    const deadline = deadlineFor(5);
    expect(windowDue(deadline, deadline - 1)).toBe(false);
    expect(windowDue(deadline, deadline)).toBe(true);
    expect(windowDue(deadline, deadline + 1)).toBe(true);
  });
});
