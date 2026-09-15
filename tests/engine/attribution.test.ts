// Who gets the tackle and who gets the sack. A corner led the league with 19
// sacks and 229 tackles because the defender draw listed corners first and
// never listed the pass rush at all.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { simulateGame } from '../../supabase/functions/_shared/engine/simulateGame.ts';
import type { PlayerStatLine, PositionGroup, TeamState } from '../../supabase/functions/_shared/engine/types.ts';
import { averageMatchup } from './fixtures.ts';

function groupOf(team: TeamState, id: string): PositionGroup | undefined {
  return team.players.find((p) => p.id === id)?.group;
}

function totals(games: number): Map<PositionGroup, { tackles: number; sacks: number }> {
  const out = new Map<PositionGroup, { tackles: number; sacks: number }>();
  for (let i = 0; i < games; i += 1) {
    const { home, away } = averageMatchup(100 + i);
    const result = simulateGame(home, away, createRng(500 + i));
    const add = (line: PlayerStatLine, team: TeamState): void => {
      const g = groupOf(team, line.playerId);
      if (g === undefined) return;
      const t = out.get(g) ?? { tackles: 0, sacks: 0 };
      t.tackles += line.tackles; t.sacks += line.sacks;
      out.set(g, t);
    };
    for (const line of result.players) add(line, line.teamId === home.id ? home : away);
  }
  return out;
}

describe('defensive attribution', () => {
  const by = totals(40);
  const of = (g: PositionGroup) => by.get(g) ?? { tackles: 0, sacks: 0 };

  it('gives the sacks to the pass rush, and none to the secondary\'s corners', () => {
    expect(of('EDGE').sacks).toBeGreaterThan(of('DT').sacks);
    expect(of('DT').sacks).toBeGreaterThan(of('LB').sacks);
    expect(of('CB').sacks).toBe(0);
  });

  it('gives linebackers the most tackles, with corners and safeties behind', () => {
    expect(of('LB').tackles).toBeGreaterThan(of('CB').tackles);
    expect(of('LB').tackles).toBeGreaterThan(of('S').tackles);
    expect(of('CB').tackles).toBeGreaterThan(0);
    expect(of('EDGE').tackles).toBeGreaterThan(0);
  });
});
