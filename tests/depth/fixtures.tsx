import { SaveProvider, OPEN_SAVE_KEY } from '../../src/app/SaveProvider';
import { NavigationProvider } from '../../src/app/NavigationProvider';
import { useNavigationState } from '../../src/app/navigation';
import { DepthChartScreen } from '../../src/screens/DepthChartScreen';
import { POSITION_GROUPS, STARTERS } from '../../supabase/functions/_shared/engine/types';
import type { DepthChartOut } from '../../supabase/functions/_shared/api/reads/depthChartTypes';

export function depthFixture(): DepthChartOut {
  return {
    revision: 'one', phase: 'REGULAR_SEASON', season: 2027, week: 1,
    rosterCount: 53, rosterTarget: 53, countEnforced: true, rosterFault: null, blockers: [],
    warnings: [], chartSaved: true, startersSet: 25, startingPlaces: 25, injuredStarters: 0,
    canFinalize: false, action: 'PLAY',
    nextGame: { gameId: 'g1', week: 1, opponentId: 'CLE', opponentName: 'Cleveland Ironmen', home: true, competition: 'REGULAR' },
    groups: POSITION_GROUPS.map((group) => ({
      group, startingPlaces: STARTERS[group], available: group === 'QB' ? 3 : 0,
      startersSet: group === 'QB' ? 1 : 0, injuredStarters: 0, needsSave: false, warnings: [],
      order: group === 'QB' ? ['Ari Vale', 'Kellan Mercer', 'Tavi Soren'].map((name, i) => ({
        playerId: 'p' + String(i), name, age: 25 + i, position: 'QB', overall: 70 + i,
        rosterStatus: 'ACTIVE', out: null, rank: i + 1, persisted: true,
        role: i === 0 ? 'Starter' : i === 1 ? 'Backup' : 'Reserve',
      })) : [],
    })),
  };
}
function Location() {
  const s = useNavigationState();
  return <output data-testid="location">{s.screen}:{s.params['id']}</output>;
}
export function DepthHarness() {
  return <SaveProvider><NavigationProvider initialScreen="depthChart" rootOf={() => 'team'}>
    <DepthChartScreen /><Location />
  </NavigationProvider></SaveProvider>;
}
export function prepare() {
  window.history.replaceState({}, '', '/depthChart');
  localStorage.setItem(OPEN_SAVE_KEY, 'depth-save');
}
