// League: standings and leaders.
//
// The competition toggle and the conference filter are live and store their
// state on the navigation frame, so leaving this screen and coming back
// restores what you had chosen. That is the navigation contract's canonical
// acceptance test, and it is testable now rather than after the data lands.

import { CompetitionToggle } from '../components/CompetitionToggle';
import { ChipRow, type Chip } from '../components/ChipRow';
import { TableScroll } from '../components/TableScroll';
import { Panel, SectionHeader } from '../components/Surface';
import { SkeletonRegion, SkeletonRows, SkeletonTable } from '../components/Skeleton';
import { useUiState } from '../app/useUiState';
import type { Competition } from '../domain/competition';
import { Screen } from './Screen';

const CONFERENCES: readonly Chip[] = [
  { key: 'all', label: 'All' },
  { key: 'AC', label: 'American' },
  { key: 'NC', label: 'National' },
];

export function LeagueScreen() {
  const [competition, setCompetition] = useUiState<Competition>('competition', 'REGULAR_SEASON');
  const [conference, setConference] = useUiState('conference', 'all');

  return (
    <Screen title="League" screen="league">
      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        <CompetitionToggle value={competition} onChange={setCompetition} />
        <ChipRow
          chips={CONFERENCES}
          value={conference}
          onChange={setConference}
          label="Conference"
        />
      </div>

      <SectionHeader title="Standings" />
      <Panel padded={false}>
        <div style={{ padding: 12 }}>
          <SkeletonRegion label="Loading standings">
            <TableScroll>
              <SkeletonTable rows={8} columns={6} />
            </TableScroll>
          </SkeletonRegion>
        </div>
      </Panel>

      <SectionHeader title="Leaders" />
      <SkeletonRegion label="Loading league leaders">
        <SkeletonRows rows={5} />
      </SkeletonRegion>
    </Screen>
  );
}
