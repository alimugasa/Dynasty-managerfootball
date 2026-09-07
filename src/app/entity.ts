// Universal entity routing. In the prototype, opening a player worked identically
// from a roster row, a leaderboard, an MVP ballot, an All-Pro team and a news
// headline — but only by convention, via hand-written inline push('player',{id})
// inside template literals. There was no shared function, so the guarantee would
// break silently during the component split. This module is that seam.
//
// RULE: no screen may construct a navigation target for an entity by hand.

export type EntityRef =
  | { kind: 'player'; id: string }
  | { kind: 'team'; id: string }
  | { kind: 'coach'; id: string }
  | { kind: 'college'; id: string }
  | { kind: 'game'; id: string }
  | { kind: 'draftPick'; id: string };

export type EntityKind = EntityRef['kind'];

export interface EntityRoute {
  screen: string;
  params: Record<string, string>;
}

/** Exhaustive over EntityRef. No default case: adding a kind without a route
 *  is a compile error, which is the point. */
export function resolveEntityRoute(ref: EntityRef): EntityRoute {
  switch (ref.kind) {
    case 'player':
      return { screen: 'player', params: { id: ref.id } };
    case 'team':
      return { screen: 'team', params: { id: ref.id } };
    case 'coach':
      return { screen: 'coach', params: { id: ref.id } };
    case 'college':
      return { screen: 'college', params: { id: ref.id } };
    case 'game':
      return { screen: 'game', params: { id: ref.id } };
    case 'draftPick':
      return { screen: 'draftPick', params: { id: ref.id } };
    default: {
      const exhaustive: never = ref;
      throw new Error(`Unrouted entity kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export const player = (id: string): EntityRef => ({ kind: 'player', id });
export const team = (id: string): EntityRef => ({ kind: 'team', id });
export const coach = (id: string): EntityRef => ({ kind: 'coach', id });
