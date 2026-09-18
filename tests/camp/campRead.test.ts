import { describe, expect, it } from 'vitest';
import { campGroups, campProgress } from '../../supabase/functions/_shared/api/reads/campSummary';
import { PRESEASON_PHASES } from '../../supabase/functions/_shared/api/preseason';
import { POSITION_GROUPS } from '../../supabase/functions/_shared/engine/types';
import { CAMP_PHASES, PHASE_LABEL, isCampPhase } from '../../src/domain/phase';
import { campRows } from '../../src/domain/camp';
import { requireCamp } from '../../src/data/camp';
import { campFixture, player } from './fixtures';

describe('camp read and presentation boundaries', () => {
  it('keeps the client phase entry points aligned with the server', () => {
    expect([...CAMP_PHASES]).toEqual([...PRESEASON_PHASES]);
    for (const phase of PRESEASON_PHASES) {
      expect(isCampPhase(phase)).toBe(true);
      expect(PHASE_LABEL[phase]).toBeTruthy();
    }
    expect(isCampPhase('REGULAR_SEASON')).toBe(false);
  });

  it('exposes the count gate without blocking preseason evaluation', () => {
    const fault = 'One cut required';
    expect(campProgress('TRAINING_CAMP', 1, fault)).toMatchObject({
      advanceRoute: 'advance-camp', advanceFault: null, finalizeFault: fault,
    });
    expect(campProgress('FINAL_CUTS', 3, fault)).toMatchObject({
      advanceRoute: 'finalize-roster', advanceFault: fault, finalizeFault: fault,
    });
    expect(campProgress('FINAL_CUTS', 3, null).finalizeFault).toBeNull();
    expect(campProgress('REGULAR_SEASON', 1, null).advanceRoute).toBeNull();
  });

  it('counts roster presence separately from injury availability in every actual group', () => {
    const groups = campGroups([player(), player({ playerId: 'b', injured: true })], [{ group: 'QB' }]);
    expect(groups.map((g) => g.group)).toEqual([...POSITION_GROUPS]);
    expect(groups.find((g) => g.group === 'QB')).toMatchObject({ count: 2, available: 1, battles: 1 });
    expect(groups.find((g) => g.group === 'LS')).toMatchObject({ count: 0, projectedPlaces: 1 });
  });

  it('sorts actual zero before unknown in both directions without mutating the board', () => {
    const rows = [player({ playerId: 'unknown', preseasonGrade: null }),
      player({ playerId: 'zero', preseasonGrade: 0 }), player({ playerId: 'seen', preseasonGrade: 10 })];
    expect(campRows(rows, '', 'ALL', 'PRESEASON', 'asc').map((p) => p.playerId)).toEqual(['zero', 'seen', 'unknown']);
    expect(campRows(rows, '', 'ALL', 'PRESEASON', 'desc').map((p) => p.playerId)).toEqual(['seen', 'zero', 'unknown']);
    expect(rows[0]?.playerId).toBe('unknown');
  });

  it('accepts genuine zeros and unknown optional finances but rejects missing required grades', () => {
    const data = campFixture();
    expect(requireCamp({ ...data, rosterCount: 0, players: [player({ capHit: null, deadMoney: null })] })).toBeTruthy();
    expect(() => requireCamp({ ...data, players: [player({ practiceGrade: Number.NaN })] })).toThrow('Missing data: camp.practiceGrade');
  });
});
