// The two builds' scouting boards, side by side.
//
// The app measures thirty-two clubs from Postgres; the play-test rig measures
// them from the seed packed into its own page. Different sources, the same
// seed underneath, and the same shapeLeague passing judgement -- so a club
// that is Dynasty Ready in one build has to be Dynasty Ready in the other.
//
// This is the test that catches the two gatherers drifting: a position group
// moved on one side, a column dropped from the rig's packed world, a cap read
// for the wrong season. Any of those shows up here as a club the two builds
// describe differently, rather than as a screenshot somebody notices weeks on.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import { teamProfiles as riggedProfiles } from '../../scripts/playtest/board.ts';
import type { TeamProfilesOut } from '../../supabase/functions/_shared/api/reads/teamProfiles';

const READER = '77777777-0000-0000-0000-0000000000ee';

describe('the app and the rig scout the same league', () => {
  let pipe: Pipe;
  let served: TeamProfilesOut['teams'] = [];

  beforeAll(async () => {
    pipe = await openPipe(READER);
    served = (await pipe.api.call<TeamProfilesOut>('team-profiles', {})).teams;
  }, 120_000);

  afterAll(async () => { await pipe.close(); });

  it('measures and labels every club identically', () => {
    const rigged = new Map(riggedProfiles().map((t) => [t.teamId, t]));
    expect(rigged.size).toBe(served.length);

    for (const club of served) {
      const mine = rigged.get(club.teamId);
      expect(mine, `the rig has no ${club.teamId}`).toBeDefined();
      if (mine === undefined) continue;
      // Named one by one rather than compared whole, so a failure says which
      // measurement drifted instead of printing two objects to diff by eye.
      expect(mine.fullName, club.teamId).toBe(club.fullName);
      expect(mine.conferenceName, club.teamId).toBe(club.conferenceName);
      expect(mine.divisionShort, club.teamId).toBe(club.divisionShort);
      expect(mine.offense, `${club.teamId} offence`).toBe(club.offense);
      expect(mine.defense, `${club.teamId} defence`).toBe(club.defense);
      expect(mine.specialTeams, `${club.teamId} special teams`).toBe(club.specialTeams);
      expect(mine.overall, `${club.teamId} overall`).toBe(club.overall);
      expect(mine.averageAge, `${club.teamId} age`).toBe(club.averageAge);
      expect(mine.capSpace, `${club.teamId} cap space`).toBe(club.capSpace);
      expect(mine.draftCapital, `${club.teamId} draft capital`).toBe(club.draftCapital);
      expect(mine.quarterbackStatus, `${club.teamId} quarterback`).toBe(club.quarterbackStatus);
      expect(mine.ownerPatience, `${club.teamId} owner`).toBe(club.ownerPatience);
      expect(mine.stadiumCapacity, `${club.teamId} stadium`).toBe(club.stadiumCapacity);
      expect(mine.rosterCount, `${club.teamId} roster count`).toBe(club.rosterCount);
      expect(mine.draftScore, `${club.teamId} draft score`).toBe(club.draftScore);
      expect(mine.draftLabel, `${club.teamId} draft label`).toBe(club.draftLabel);
      expect(mine.ownerMood, `${club.teamId} owner mood`).toBe(club.ownerMood);
      expect(mine.fanPressure, `${club.teamId} fan pressure`).toBe(club.fanPressure);
      expect(mine.marketSize, `${club.teamId} market size`).toBe(club.marketSize);
      expect(mine.bestPlayer, `${club.teamId} best player`).toEqual(club.bestPlayer);
      expect(mine.youngPlayer, `${club.teamId} young player`).toEqual(club.youngPlayer);
      expect(mine.biggestWeakness, `${club.teamId} weakness`).toBe(club.biggestWeakness);
      expect(mine.rosterTimeline, `${club.teamId} timeline`).toBe(club.rosterTimeline);
      expect(mine.suggestedMove, `${club.teamId} first move`).toBe(club.suggestedMove);
      expect(mine.franchiseStatus, `${club.teamId} status`).toBe(club.franchiseStatus);
      expect(mine.overallBand, `${club.teamId} overall band`).toBe(club.overallBand);
      expect(mine.offenseBand, `${club.teamId} offence band`).toBe(club.offenseBand);
      expect(mine.defenseBand, `${club.teamId} defence band`).toBe(club.defenseBand);
      expect(mine.specialTeamsBand, `${club.teamId} ST band`).toBe(club.specialTeamsBand);
      expect(mine.difficulty, `${club.teamId} difficulty`).toBe(club.difficulty);
      expect(mine.archetype, `${club.teamId} archetype`).toBe(club.archetype);
      expect([...mine.tags].sort(), `${club.teamId} tags`).toEqual([...club.tags].sort());
    }
  });
});
