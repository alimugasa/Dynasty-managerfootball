// A league's worth of faces, checked for repeats.
//
// The request asks for an automated test over at least a thousand players that
// reports duplicates and near-duplicates. This is that test, and it is written
// to fail loudly rather than to pass quietly: the assertions are on the counts
// it finds, and the report it prints on failure names the pairs so the number
// can be argued with.
//
// The population is four thousand, not one thousand, because four thousand is
// roughly what a save actually holds -- thirty-two rosters plus a draft class
// plus the free-agent pool -- and a uniqueness guarantee that only holds at a
// quarter of the real load is not a guarantee.

import { describe, expect, it } from 'vitest';
import {
  FaceRegistry, NEAR_DUPLICATE, distance, isClone, resolveCollision, signature,
} from '../../supabase/functions/_shared/avatar/unique';
import {
  drawAncestry, generateAvatar, generateIdentity,
} from '../../supabase/functions/_shared/avatar/generate';
import type { AvatarIdentity } from '../../supabase/functions/_shared/avatar/profile';

const POPULATION = 4000;

const POSITIONS = [
  'QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C',
  'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS',
];

/** Seeds shaped like the ones the migration writes: hex, and unrelated to
 *  anything about the player. */
const seedAt = (i: number): string =>
  `${(i * 2654435761 >>> 0).toString(16).padStart(8, '0')}b7e151628aed2a6a`;

interface Person {
  readonly seed: string;
  readonly identity: AvatarIdentity;
}

function league(resolve: boolean): readonly Person[] {
  const registry = new FaceRegistry();
  const people: Person[] = [];
  for (let i = 0; i < POPULATION; i += 1) {
    const seed = seedAt(i);
    const ancestry = drawAncestry(seed);
    if (resolve) {
      const settled = resolveCollision(seed, ancestry, registry);
      registry.add(settled.identity);
      people.push({ seed, identity: settled.identity });
    } else {
      const identity = generateIdentity(seed, ancestry);
      registry.add(identity);
      people.push({ seed, identity });
    }
  }
  return people;
}

describe('a league of faces', () => {
  const people = league(true);

  it('gives no two players the same structural signature', () => {
    const seen = new Map<string, string>();
    const repeats: string[] = [];
    for (const person of people) {
      const key = signature(person.identity);
      const first = seen.get(key);
      if (first === undefined) seen.set(key, person.seed);
      else repeats.push(`${first} and ${person.seed}`);
    }
    expect(repeats, `duplicate faces: ${repeats.slice(0, 10).join('; ')}`).toEqual([]);
  });

  it('keeps near-duplicates to a handful in four thousand players', () => {
    // Quadratic, so bucketed on the two components that differ most often --
    // a pair that shares neither the skull nor the nose cannot be within the
    // near-duplicate threshold, because that is already six of the nine.
    const buckets = new Map<string, Person[]>();
    for (const person of people) {
      for (const key of [`h:${person.identity.baseHead}`, `n:${person.identity.nose}`]) {
        const list = buckets.get(key) ?? [];
        list.push(person);
        buckets.set(key, list);
      }
    }
    const pairs = new Set<string>();
    for (const list of buckets.values()) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i] as Person;
          const b = list[j] as Person;
          if (isClone(a.identity, b.identity)) {
            pairs.add([a.seed, b.seed].sort().join(' ~ '));
          }
        }
      }
    }
    const report = [...pairs].slice(0, 10).join('; ');
    // Not zero. Four thousand draws from a finite library will produce some
    // close pairs, and a test that demanded none would be demanding that the
    // generator stop being random. A handful is the honest bar.
    expect(pairs.size, `near-duplicates (<${NEAR_DUPLICATE}): ${report}`)
      .toBeLessThanOrEqual(POPULATION / 200);
  });

  it('uses most of every trait library', () => {
    const coverage = (pick: (i: AvatarIdentity) => string): number =>
      new Set(people.map((p) => pick(p.identity))).size;
    expect(coverage((i) => i.baseHead)).toBeGreaterThan(40);
    expect(coverage((i) => i.nose)).toBeGreaterThan(25);
    expect(coverage((i) => i.eyes)).toBeGreaterThan(20);
    expect(coverage((i) => i.lips)).toBeGreaterThan(15);
    expect(coverage((i) => i.skinStep.toString())).toBeGreaterThan(25);
  });
});

describe('the same seed', () => {
  it('generates the same person every time', () => {
    for (let i = 0; i < 50; i += 1) {
      const seed = seedAt(i * 7);
      const a = generateAvatar({ seed, position: 'WR', age: 25 });
      const b = generateAvatar({ seed, position: 'WR', age: 25 });
      expect(a).toEqual(b);
    }
  });

  it('keeps the person when the years pass', () => {
    // The thing the request asks for in as many words: a 37-year-old is an
    // older version of the same man, not a different one.
    for (let i = 0; i < 50; i += 1) {
      const seed = seedAt(i * 13);
      const young = generateAvatar({ seed, position: 'LB', age: 22 });
      const old = generateAvatar({ seed, position: 'LB', age: 37 });
      expect(old.identity).toEqual(young.identity);
      expect(distance(old.identity, young.identity)).toBe(0);
      expect(old.appearance.ageWear).toBeGreaterThan(young.appearance.ageWear);
    }
  });

  it('keeps the person when the haircut changes', () => {
    const seed = seedAt(99);
    const base = generateAvatar({ seed, position: 'QB', age: 28 });
    const restyled = generateAvatar({
      seed, position: 'QB', age: 28,
      overrides: { appearance: { hairstyle: 'bald', facialHair: 'beard-full' } },
    });
    expect(signature(restyled.identity)).toBe(signature(base.identity));
    expect(restyled.appearance.hairstyle).toBe('bald');
  });
});

describe('position', () => {
  it('builds the trenches differently from the secondary', () => {
    const heavyAt = (position: string): number => {
      let heavy = 0;
      for (let i = 0; i < 400; i += 1) {
        const build = generateAvatar({ seed: seedAt(i), position, age: 26 }).appearance.build;
        if (build === 'heavy' || build === 'massive') heavy += 1;
      }
      return heavy / 400;
    };
    expect(heavyAt('OG')).toBeGreaterThan(0.75);
    expect(heavyAt('CB')).toBeLessThan(0.05);
  });

  it('draws a build for every position the seed uses', () => {
    for (const position of POSITIONS) {
      const profile = generateAvatar({ seed: seedAt(3), position, age: 26 });
      expect(profile.appearance.build).toBeTruthy();
    }
  });
});
