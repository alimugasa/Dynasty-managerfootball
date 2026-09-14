// The scouting board, against the world it actually ships with.
//
// The unit tests prove the rules; this proves the rules meet real data. Two
// things can only be checked here. First, that every club in the shipped
// league measures -- a null in this read is a hole in the seed or a join that
// silently dropped, and both look like a working screen with dashes on it.
// Second, that the labels still divide the league: thresholds are calibrated
// against the spread the seed has, so a seed that drifts must fail a test
// rather than quietly collapse every club into "Balanced".

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import { TEAM_TAGS } from '../../supabase/functions/_shared/api/reads/teamShape.ts';
import type { TeamProfilesOut } from '../../supabase/functions/_shared/api/reads/teamProfiles';

const READER = '77777777-0000-0000-0000-0000000000dd';

describe('the thirty-two clubs, measured', () => {
  let pipe: Pipe;
  let board: TeamProfilesOut['teams'] = [];

  beforeAll(async () => {
    pipe = await openPipe(READER);
    board = (await pipe.api.call<TeamProfilesOut>('team-profiles', {})).teams;
  }, 120_000);

  afterAll(async () => { await pipe.close(); });

  it('answers with the whole league', () => {
    expect(board).toHaveLength(32);
    expect(new Set(board.map((t) => t.teamId)).size).toBe(32);
  });

  it('measures every club it lists', () => {
    // Rule 3 the other way round: the screen reports a null honestly, so a
    // null here is not a display bug -- it is a fact the seed or the query
    // lost, and it must not reach the screen unnoticed.
    for (const t of board) {
      for (const [what, value] of [
        ['overall', t.overall], ['offense', t.offense], ['defense', t.defense],
        ['special teams', t.specialTeams], ['average age', t.averageAge],
        ['cap space', t.capSpace], ['draft capital', t.draftCapital],
        ['owner patience', t.ownerPatience], ['stadium capacity', t.stadiumCapacity],
      ] as const) {
        expect(value, `${t.teamId} has no ${what}`).not.toBeNull();
      }
      expect(t.quarterbackStatus, `${t.teamId} has no quarterback`).not.toBeNull();
      expect(t.difficulty, `${t.teamId} has no difficulty`).not.toBeNull();
      expect(t.archetype, `${t.teamId} has no archetype`).not.toBeNull();
    }
  });

  it('reports fan pressure as absent, because nothing models a crowd yet', () => {
    // Named rather than left out: the alternative is a number derived from
    // market size wearing a word that suggests it was simulated.
    for (const t of board) expect(t.fanPressure).toBeNull();
  });

  it('names conferences and divisions rather than printing their ids', () => {
    for (const t of board) {
      expect(t.conferenceName, t.teamId).not.toBe(t.conferenceId);
      expect(t.divisionShort, t.teamId).not.toContain(t.conferenceId);
      expect(t.divisionShort.length, t.teamId).toBeGreaterThan(0);
    }
  });

  it('keeps every filter chip pointing at somebody', () => {
    // A chip that matches nothing is a dead control. Eight of these are
    // league-relative and cannot be empty by construction; the ninth --
    // an elite quarterback -- is an absolute bar, and this is what says the
    // shipped league clears it.
    for (const tag of TEAM_TAGS) {
      const matched = board.filter((t) => (t.tags as readonly string[]).includes(tag));
      expect(matched.length, `no club is tagged ${tag}`).toBeGreaterThan(0);
    }
  });

  it('spreads the difficulty bands across the league', () => {
    const bands = new Set(board.map((t) => t.difficulty));
    // Cap Hell is not expected: no club in the shipped league starts over the
    // cap, and forcing one into the band to fill it would be inventing a fact.
    expect(bands.size).toBeGreaterThanOrEqual(4);
    for (const band of ['Dynasty Ready', 'Playoff Push', 'Middle Class']) {
      expect(bands.has(band), band).toBe(true);
    }
  });

  it('does not let one archetype swallow the league', () => {
    // The archetype thresholds are absolute and calibrated against this seed's
    // spread. A seed whose units or ages tighten would push every club into
    // one label, and the description would stop describing anything.
    const counts = new Map<string, number>();
    for (const t of board) {
      counts.set(t.archetype ?? '', (counts.get(t.archetype ?? '') ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(20);
  });

  it('rates a roster on the players who would be on the field', () => {
    // The mean of all ninety would rate a club by the depth of its practice
    // squad, and every club would land within a point of every other.
    const ratings = board.map((t) => t.overall ?? 0);
    expect(Math.max(...ratings) - Math.min(...ratings)).toBeGreaterThanOrEqual(5);
  });
});
