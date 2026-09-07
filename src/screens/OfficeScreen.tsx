// Office: the front office. Cap, draft capital, staff, and the settings that
// do not belong on any other tab.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { Caption, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { SkeletonLine, SkeletonRegion, SkeletonRows, SkeletonTiles } from '../components/Skeleton';
import { Screen } from './Screen';

export function OfficeScreen() {
  const nav = useNavigator();

  return (
    <Screen title="Office" screen="office">
      <SectionHeader title="Salary cap" />
      <SkeletonRegion label="Loading cap position">
        <SkeletonTiles count={3} />
        <div style={{ marginTop: 10 }}>
          <Panel>
            <div style={{ display: 'grid', gap: 8 }}>
              <SkeletonLine width="100%" height={10} radius={999} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <SkeletonLine width={80} height={9} />
                <SkeletonLine width={64} height={9} />
              </div>
            </div>
          </Panel>
        </div>
      </SkeletonRegion>

      <SectionHeader title="Draft capital" />
      <SkeletonRegion label="Loading draft picks">
        <SkeletonRows rows={4} lead={false} />
      </SkeletonRegion>

      <SectionHeader title="Front office" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          {/* Navigable rows are live: they exercise push, and the back
              affordance that appears with them. */}
          <ListRow
            title="Scouting department"
            subtitle="Board, budget, reports"
            navigable
            onSelect={() => nav.push('scouting')}
          />
          <ListRow
            title="Coaching staff"
            subtitle="Hire and fire"
            navigable
            onSelect={() => nav.push('staff')}
          />
          <ListRow
            title="Transactions"
            subtitle="Signings, releases, trades"
            navigable
            onSelect={() => nav.push('transactions')}
          />
        </div>
      </Panel>

      <p style={{ margin: '18px 0 0', color: COLOR.dim, fontSize: 12, lineHeight: 1.6 }}>
        <Caption>Not connected</Caption>
        <br />
        The shell is complete. Screens render their real layout with skeleton
        placeholders until the data layer is wired.
      </p>
    </Screen>
  );
}
