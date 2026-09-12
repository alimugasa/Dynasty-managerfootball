// clubs: the thirty-two clubs a new game can be started on.
//
// Its own route rather than a corner of `save`, because it answers a question
// asked before any save exists: the club is chosen first and the dynasty is
// created from it. Reading it through `save` would mean opening whichever save
// was touched last in order to list clubs that have nothing to do with it.
//
// The names and colours come from the template world -- the imported starting
// league every save is cloned from -- so they are the same thirty-two on every
// slot screen, before and after any of them is played.

import type { Handler } from '../context.ts';
import { clubsOf, type Club } from './save.ts';

export interface ClubsOut {
  readonly clubs: readonly Club[];
}

export const clubs: Handler<Record<string, never>, ClubsOut> = {
  auth: 'required',
  parse: () => ({}),
  run: async ({ sql }) => {
    const [template] = await sql<{ id: string }[]>`select id from public.saves where is_template`;
    if (template === undefined) throw new Error('No template world has been imported');
    return { clubs: await clubsOf(sql, template.id) };
  },
};
