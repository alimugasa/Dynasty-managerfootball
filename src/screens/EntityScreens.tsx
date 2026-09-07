// Screens reached by drilling in rather than by a tab.
//
// Each is registered so that every target resolvable by resolveEntityRoute
// lands on a real screen. A nav target with no screen behind it is a dead end
// that only shows up when someone taps it, so the registry is asserted by test.

import { useNavigator } from '../app/navigation';
import { Panel, SectionHeader } from '../components/Surface';
import {
  SkeletonLine, SkeletonRegion, SkeletonRows, SkeletonTiles,
} from '../components/Skeleton';
import { TeamMarkSkeleton } from '../components/TeamMark';
import { Screen } from './Screen';

/** Header shared by every entity profile: a mark, a name, a line of metadata. */
function ProfileHeader({ markSize = 48 }: { readonly markSize?: number }) {
  return (
    <Panel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <TeamMarkSkeleton size={markSize} />
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 7 }}>
          <SkeletonLine width="68%" height={16} />
          <SkeletonLine width="44%" height={11} />
        </div>
      </div>
    </Panel>
  );
}

export function PlayerScreen() {
  const nav = useNavigator();
  const id = nav.readUi<string>('__id', '');
  return (
    <Screen title="Player" screen="player" {...(id === '' ? {} : { subtitle: id })}>
      <SkeletonRegion label="Loading player profile">
        <ProfileHeader />
        <div style={{ marginTop: 10 }}><SkeletonTiles count={3} /></div>
        <SectionHeader title="Season" />
        <SkeletonRows rows={4} lead={false} />
        <SectionHeader title="Career" />
        <SkeletonRows rows={5} lead={false} />
      </SkeletonRegion>
    </Screen>
  );
}

export function CoachScreen() {
  return (
    <Screen title="Coach" screen="coach">
      <SkeletonRegion label="Loading coach profile">
        <ProfileHeader />
        <div style={{ marginTop: 10 }}><SkeletonTiles count={3} /></div>
        <SectionHeader title="Tenure" />
        <SkeletonRows rows={4} lead={false} />
      </SkeletonRegion>
    </Screen>
  );
}

export function CollegeScreen() {
  return (
    <Screen title="College" screen="college">
      <SkeletonRegion label="Loading college">
        <ProfileHeader markSize={40} />
        <SectionHeader title="Alumni" />
        <SkeletonRows rows={6} />
      </SkeletonRegion>
    </Screen>
  );
}

export function GameScreen() {
  return (
    <Screen title="Game" screen="game">
      <SkeletonRegion label="Loading game">
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <TeamMarkSkeleton size={40} />
            <SkeletonLine width={56} height={26} />
            <div style={{ flex: 1 }} />
            <SkeletonLine width={56} height={26} />
            <TeamMarkSkeleton size={40} />
          </div>
        </Panel>
        <SectionHeader title="Team stats" />
        <SkeletonRows rows={6} lead={false} />
        <SectionHeader title="Scoring" />
        <SkeletonRows rows={4} lead={false} />
      </SkeletonRegion>
    </Screen>
  );
}

export function DraftPickScreen() {
  return (
    <Screen title="Draft pick" screen="draftPick">
      <SkeletonRegion label="Loading draft pick">
        <ProfileHeader markSize={40} />
        <SectionHeader title="Scouting report" />
        <SkeletonRows rows={4} lead={false} />
      </SkeletonRegion>
    </Screen>
  );
}

/** Reached from the Office list. Named screens rather than a generic stub, so
 *  the registry stays honest about what exists. */
export function ScoutingScreen() {
  return (
    <Screen title="Scouting" screen="scouting">
      <SkeletonRegion label="Loading scouting department">
        <SkeletonTiles count={2} />
        <SectionHeader title="Board" />
        <SkeletonRows rows={8} />
      </SkeletonRegion>
    </Screen>
  );
}

export function StaffScreen() {
  return (
    <Screen title="Staff" screen="staff">
      <SkeletonRegion label="Loading coaching staff">
        <SkeletonRows rows={6} />
      </SkeletonRegion>
    </Screen>
  );
}

export function TransactionsScreen() {
  return (
    <Screen title="Transactions" screen="transactions">
      <SkeletonRegion label="Loading transactions">
        <SkeletonRows rows={10} lead={false} />
      </SkeletonRegion>
    </Screen>
  );
}
