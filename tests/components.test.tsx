import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AbilityDial } from '../src/components/AbilityDial';
import { PerformanceChip } from '../src/components/PerformanceChip';
import { gradeColor } from '../src/app/tokens';
import { resolveEntityRoute, type EntityRef } from '../src/app/entity';
import { MissingData, required } from '../src/data/errors';

describe('AbilityDial', () => {
  it('renders the value across the range', () => {
    for (const v of [0, 50, 74, 99]) {
      const { unmount } = render(<AbilityDial value={v} />);
      expect(screen.getByLabelText(`Overall ${v}`)).toBeTruthy();
      unmount();
    }
  });

  it('renders an explicit unavailable state for null, never zero', () => {
    render(<AbilityDial value={null} />);
    expect(screen.getByLabelText('Overall unavailable')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('PerformanceChip', () => {
  it('maps every ramp stop to a distinct colour', () => {
    const colors = [95, 85, 75, 65, 55, 40].map(gradeColor);
    expect(new Set(colors).size).toBe(6);
  });

  it('renders unavailable for null', () => {
    render(<PerformanceChip value={null} />);
    expect(screen.getByLabelText('Grade unavailable')).toBeTruthy();
  });
});

describe('entity routing', () => {
  it('resolves every entity kind to a screen', () => {
    const refs: EntityRef[] = [
      { kind: 'player', id: 'p' }, { kind: 'team', id: 't' }, { kind: 'coach', id: 'c' },
      { kind: 'college', id: 'g' }, { kind: 'game', id: 'x' }, { kind: 'draftPick', id: 'd' },
    ];
    for (const r of refs) expect(resolveEntityRoute(r).screen).toBeTruthy();
  });

  it('sends the same player id to the same route from any origin', () => {
    const a = resolveEntityRoute({ kind: 'player', id: 'DEN_QB_01' });
    const b = resolveEntityRoute({ kind: 'player', id: 'DEN_QB_01' });
    expect(a).toEqual(b);
  });
});

describe('missing data', () => {
  it('throws rather than returning a fallback', () => {
    expect(() => required(null, { table: 'players', column: 'ovr', id: 'X' })).toThrow(MissingData);
  });

  it('carries the table, column and id', () => {
    try {
      required(undefined, { table: 'players', column: 'age', id: 'P100817_OT' });
    } catch (e) {
      const m = e as MissingData;
      expect(m.table).toBe('players');
      expect(m.column).toBe('age');
      expect(m.id).toBe('P100817_OT');
    }
  });
});
