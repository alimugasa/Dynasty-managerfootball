// Roster: the squad, filtered and sorted.
//
// Both controls persist on the navigation frame. Opening a player from a
// filtered, sorted, scrolled roster and pressing back must return to exactly
// that view -- see docs/NAVIGATION-CONTRACT.md.

import { ChipRow, type Chip } from '../components/ChipRow';
import { SectionHeader } from '../components/Surface';
import { SkeletonRegion, SkeletonRows } from '../components/Skeleton';
import { useUiState } from '../app/useUiState';
import { Screen } from './Screen';

const GROUPS: readonly Chip[] = [
  { key: 'all', label: 'All' },
  { key: 'QB', label: 'QB' }, { key: 'RB', label: 'RB' }, { key: 'WR', label: 'WR' },
  { key: 'TE', label: 'TE' }, { key: 'OL', label: 'OL' }, { key: 'EDGE', label: 'Edge' },
  { key: 'DT', label: 'DT' }, { key: 'LB', label: 'LB' }, { key: 'CB', label: 'CB' },
  { key: 'S', label: 'S' }, { key: 'K', label: 'K' }, { key: 'P', label: 'P' },
];

const SORTS: readonly Chip[] = [
  { key: 'depth', label: 'Depth' },
  { key: 'overall', label: 'Overall' },
  { key: 'age', label: 'Age' },
  { key: 'cap', label: 'Cap hit' },
];

export function RosterScreen() {
  const [group, setGroup] = useUiState('group', 'all');
  const [sort, setSort] = useUiState('sort', 'depth');

  return (
    <Screen title="Roster" screen="roster">
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        <ChipRow chips={GROUPS} value={group} onChange={setGroup} label="Position group" />
        <ChipRow chips={SORTS} value={sort} onChange={setSort} label="Sort by" />
      </div>

      <SectionHeader title={group === 'all' ? 'All players' : group} />
      <SkeletonRegion label="Loading roster">
        <SkeletonRows rows={10} />
      </SkeletonRegion>
    </Screen>
  );
}
