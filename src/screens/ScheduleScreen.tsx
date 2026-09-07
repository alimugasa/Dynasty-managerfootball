// Schedule: the season, week by week.

import { ChipRow, type Chip } from '../components/ChipRow';
import { SectionHeader } from '../components/Surface';
import { SkeletonRegion, SkeletonRows } from '../components/Skeleton';
import { useUiState } from '../app/useUiState';
import { Screen } from './Screen';

/** Eighteen weeks plus the postseason. The row scrolls inside itself; a
 *  nineteen-chip row is exactly what would otherwise widen the page. */
const WEEKS: readonly Chip[] = [
  ...Array.from({ length: 18 }, (_, i) => ({ key: String(i + 1), label: `Wk ${i + 1}` })),
  { key: 'post', label: 'Post' },
];

export function ScheduleScreen() {
  const [week, setWeek] = useUiState('week', '1');

  return (
    <Screen title="Schedule" screen="schedule">
      <div style={{ marginTop: 8 }}>
        <ChipRow chips={WEEKS} value={week} onChange={setWeek} label="Week" />
      </div>

      <SectionHeader title={week === 'post' ? 'Postseason' : `Week ${week}`} />
      <SkeletonRegion label="Loading fixtures">
        <SkeletonRows rows={8} />
      </SkeletonRegion>
    </Screen>
  );
}
