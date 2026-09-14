// The labels a club gets, and the rules that put them there.
//
// These are the one place on the scouting board where judgement enters, so the
// judgement is tested. Two rules matter most: a label is never invented over a
// measurement that is missing, and a ranked label is a rank in this league --
// which means it depends on the other thirty-one, and a test that feeds it one
// club would prove nothing.

import { describe, expect, it } from 'vitest';
import {
  archetypeOf, quarterbackStatus, shapeLeague, type TeamMeasure,
} from '../supabase/functions/_shared/api/reads/teamShape';

const measure = (over: Partial<TeamMeasure>): TeamMeasure => ({
  teamId: 'CLE', offense: 78, defense: 78, specialTeams: 74, overall: 78,
  averageAge: 25.5, capSpace: 18_000_000, draftCapital: 480, quarterback: 82,
  ...over,
});

/** A league of `n` clubs whose strength steps down one point at a time, so a
 *  rank is unambiguous. */
const league = (n: number, over: (i: number) => Partial<TeamMeasure> = () => ({})) =>
  Array.from({ length: n }, (_, i) => measure({
    teamId: `T${String(i + 1).padStart(2, '0')}`, overall: 90 - i, ...over(i),
  }));

describe('what a quarterback is called', () => {
  it('reads the position against itself, not against the league', () => {
    expect(quarterbackStatus(93)).toBe('Elite');
    expect(quarterbackStatus(88)).toBe('Elite');
    expect(quarterbackStatus(87)).toBe('Established');
    expect(quarterbackStatus(72)).toBe('Starter');
    expect(quarterbackStatus(66)).toBe('Question mark');
    expect(quarterbackStatus(60)).toBe('Unsettled');
  });

  it('says nothing about a club with no quarterback on the books', () => {
    // Not "Unsettled": that is a judgement about a player, and there is none.
    expect(quarterbackStatus(null)).toBeNull();
  });
});

describe('the shape of a roster', () => {
  it('describes a lopsided club by its lopsidedness first', () => {
    expect(archetypeOf(measure({ offense: 82, defense: 78 }))).toBe('Offensive engine');
    expect(archetypeOf(measure({ offense: 78, defense: 82 }))).toBe('Defensive core');
  });

  it('describes an even club by its age', () => {
    expect(archetypeOf(measure({ averageAge: 24.9 }))).toBe('Young core');
    expect(archetypeOf(measure({ averageAge: 26.0 }))).toBe('Veteran window');
    expect(archetypeOf(measure({ averageAge: 25.5 }))).toBe('Balanced');
  });

  it('refuses to describe a club it cannot measure', () => {
    expect(archetypeOf(measure({ offense: null }))).toBeNull();
    expect(archetypeOf(measure({ defense: null }))).toBeNull();
    // Units but no age is still describable: it just cannot be aged.
    expect(archetypeOf(measure({ averageAge: null }))).toBe('Balanced');
  });
});

describe('how hard the job is', () => {
  it('bands the league by where a club ranks in it', () => {
    const shapes = shapeLeague(league(32));
    expect(shapes.get('T01')?.difficulty).toBe('Dynasty Ready');
    expect(shapes.get('T06')?.difficulty).toBe('Dynasty Ready');
    expect(shapes.get('T07')?.difficulty).toBe('Playoff Push');
    expect(shapes.get('T15')?.difficulty).toBe('Middle Class');
    expect(shapes.get('T25')?.difficulty).toBe('Rebuild');
    expect(shapes.get('T32')?.difficulty).toBe('Hard Rebuild');
  });

  it('puts a club that owes more than it can spend in cap hell first', () => {
    // Being over the cap outranks being good: the first thing that manager
    // does is cut somebody, whatever the roster is rated.
    const shapes = shapeLeague(league(32, (i) => (i === 0 ? { capSpace: -2_000_000 } : {})));
    expect(shapes.get('T01')?.difficulty).toBe('Cap Hell');
  });

  it('leaves an unmeasured club unranked rather than ranking it last', () => {
    // Last is a claim about a club. An unrated one has earned no claim, so it
    // gets no band and none of the four chips a band hands out -- but it keeps
    // the chips it earned on measurements it does have, because an unknown
    // roster rating says nothing about known cap space.
    const shapes = shapeLeague([...league(4), measure({ teamId: 'UNK', overall: null })]);
    const unknown = shapes.get('UNK');
    expect(unknown?.difficulty).toBeNull();
    for (const banded of ['CONTENDERS', 'PLAYOFF_PUSH', 'MID_TIER', 'REBUILDS']) {
      expect(unknown?.tags, banded).not.toContain(banded);
    }
    expect(unknown?.tags).toContain('CAP_SPACE');
    expect(shapes.get('T01')?.difficulty).toBe('Dynasty Ready');
  });
});

describe('the tags the chips filter on', () => {
  it('gives the quartile chips to eight clubs each', () => {
    const shapes = shapeLeague(league(32, (i) => ({
      capSpace: i * 1_000_000,
      averageAge: 24 + i * 0.1,
      draftCapital: 300 + i,
    })));
    const count = (tag: string) =>
      [...shapes.values()].filter((s) => (s.tags as readonly string[]).includes(tag)).length;
    expect(count('CAP_SPACE')).toBe(8);
    expect(count('YOUNG_ROSTER')).toBe(8);
    expect(count('HIGH_DRAFT_PICKS')).toBe(8);
  });

  it('takes the youngest for the young chip, not the oldest', () => {
    const shapes = shapeLeague(league(32, (i) => ({ averageAge: 24 + i * 0.1 })));
    expect(shapes.get('T01')?.tags).toContain('YOUNG_ROSTER');
    expect(shapes.get('T32')?.tags).not.toContain('YOUNG_ROSTER');
  });

  it('gives the elite-quarterback chip on the position, not on a rank', () => {
    // Every club rated 88+ gets it, however many that is -- a league with nine
    // good quarterbacks has nine, and one with none has none.
    const shapes = shapeLeague(league(32, (i) => ({ quarterback: i < 9 ? 90 : 70 })));
    const elite = [...shapes.values()].filter((s) => s.tags.includes('ELITE_QB'));
    expect(elite).toHaveLength(9);
  });

  it('tags a club with the chip its difficulty earned it', () => {
    const shapes = shapeLeague(league(32));
    expect(shapes.get('T01')?.tags).toContain('CONTENDERS');
    expect(shapes.get('T07')?.tags).toContain('PLAYOFF_PUSH');
    expect(shapes.get('T15')?.tags).toContain('MID_TIER');
    expect(shapes.get('T32')?.tags).toContain('REBUILDS');
  });
});
