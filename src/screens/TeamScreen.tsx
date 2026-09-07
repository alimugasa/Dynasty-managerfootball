// Team: the club you manage, at a glance.
//
// Every data region is a skeleton until the data layer lands. The layout is the
// real layout, which is the point of building it this way: when the numbers
// arrive they drop into a page that already has the right shape, rather than
// the page reflowing around them.

import { COLOR } from '../app/tokens';
import { Caption, Panel, SectionHeader } from '../components/Surface';
import {
  SkeletonLine, SkeletonRegion, SkeletonRows, SkeletonTiles,
} from '../components/Skeleton';
import { TeamMarkSkeleton } from '../components/TeamMark';
import { Screen } from './Screen';

export function TeamScreen() {
  return (
    <Screen title="Team" screen="team">
      <SkeletonRegion label="Loading club overview">
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <TeamMarkSkeleton size={48} />
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 7 }}>
              <SkeletonLine width="62%" height={16} />
              <SkeletonLine width="40%" height={11} />
            </div>
          </div>
        </Panel>

        <div style={{ marginTop: 10 }}>
          <SkeletonTiles count={3} />
        </div>

        <SectionHeader title="Next fixture" />
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <TeamMarkSkeleton size={36} />
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6 }}>
              <SkeletonLine width="70%" height={13} />
              <SkeletonLine width="45%" height={10} />
            </div>
            <SkeletonLine width={44} height={26} />
          </div>
        </Panel>

        <SectionHeader title="Recent form" />
        <SkeletonRows rows={4} />

        <SectionHeader title="Coaching staff" />
        <SkeletonRows rows={3} />

        <p style={{ margin: '18px 0 0', color: COLOR.dim, fontSize: 12, lineHeight: 1.6 }}>
          <Caption>Not connected</Caption>
          <br />
          Components are built; the data layer is not wired yet. These are
          placeholders showing the shape of the screen, not values.
        </p>
      </SkeletonRegion>
    </Screen>
  );
}
