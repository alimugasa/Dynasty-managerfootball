import { CampScreen } from '../../src/screens/CampScreen';
import { SaveProvider, OPEN_SAVE_KEY } from '../../src/app/SaveProvider';
import { NavigationProvider } from '../../src/app/NavigationProvider';
import { useNavigationState } from '../../src/app/navigation';
import type { CampOut, CampPlayerOut } from '../../supabase/functions/_shared/api/reads/camp';
import type { SaveOut } from '../../supabase/functions/_shared/api/reads/save';
import type { CutOutcome } from '../../supabase/functions/_shared/api/handlers/campMoves';

export function player(overrides: Partial<CampPlayerOut> = {}): CampPlayerOut {
  return {
    playerId: 'camp-a', name: 'Kellan Mercer', position: 'QB', group: 'QB',
    overall: 72, potential: 81, age: 24, experienceYears: 2, capHit: 2_000_000,
    deadMoney: 400_000, contractYears: 2, draftRound: 3, rookie: false,
    depth: 2, depthOrder: 2, groupSize: 2, specialTeams: 30, schemeFit: 50,
    injured: false, weeksOut: null, practiceGrade: 69, practiceSource: 'RECORDED',
    preseasonGrade: 82, preseasonBasis: 'PRODUCTION', preseasonGames: 1,
    probability: 61, status: 'BUBBLE', statusLabel: 'Bubble', gradeDelta: 13, trend: 'RISER',
    ...overrides,
  };
}

export function campFixture(): CampOut {
  const a = player();
  const b = player({ playerId: 'camp-b', name: 'Rowan Vale', age: 31, overall: 75,
    practiceGrade: 80, preseasonGrade: 65, gradeDelta: -15, trend: 'FALLER', depth: 1, depthOrder: 1 });
  const c = player({ playerId: 'camp-c', name: 'Tavi Soren', position: 'WR', group: 'WR',
    preseasonGrade: null, preseasonGames: 0, trend: 'UNSEEN', gradeDelta: 0,
    injured: true, weeksOut: 2, status: 'INJURED', statusLabel: 'Injured' });
  return {
    phase: 'PRESEASON', season: 2027, preseasonWeek: 2, preseasonWeeks: 3,
    rosterCount: 54, rosterLimit: 53, campLimit: 90, limitEnforced: true,
    cutsRemaining: 1, rosterFault: 'One player must be released before the season starts.',
    capSpace: 8_000_000, injuredCount: 1, battleCount: 1,
    nextOpponentId: 'CLE', nextOpponentName: 'Cleveland Ironmen', nextPreseasonWeek: 2,
    players: [a, b, c], groups: [
      { group: 'QB', count: 2, available: 2, startingPlaces: 1, projectedPlaces: 2, battles: 1 },
      { group: 'WR', count: 1, available: 0, startingPlaces: 3, projectedPlaces: 5, battles: 0 },
      { group: 'LS', count: 0, available: 0, startingPlaces: 0, projectedPlaces: 1, battles: 0 },
    ],
    battles: [{ group: 'QB', forDepth: 1, starting: true, closeness: 80, players: [a, b] }],
    bubble: [a], rookies: [], veteransAtRisk: [b], injuries: [c], movers: [a, b],
    depthWarnings: ['No long snapper on the roster.'], availabilityWarnings: ['WR: 0 on the roster for 3 starting places.'],
    fixtures: [{ gameId: 'pre-1', week: 1, opponentId: 'BUF', opponentName: 'Buffalo Stampede',
      home: true, status: 'FINAL', ourScore: 24, theirScore: 17, result: 'W' }],
    preseasonRecord: { wins: 1, losses: 0, ties: 0 },
    progress: { active: true, phaseLabel: 'Preseason', nextPhaseLabel: 'Preseason',
      deadline: 'Finalize the roster before regular-season week 1.', advanceLabel: 'Play the preseason game',
      advanceRoute: 'advance-camp', advanceFault: null,
      finalizeFault: 'One player must be released before the season starts.' },
  };
}

export function saveRead(phase: string): SaveOut {
  return { save: {
    saveId: 'camp-save', name: 'Camp dynasty', userTeamId: 'BUF', season: 2027, week: 2,
    phase, weeks: 18, slot: 1, gmName: 'Ari Vale', gmStyle: null, settings: null, checklist: {},
  }, clubs: [] };
}

export function cutPreview(): CutOutcome {
  return { playerId: 'camp-a', name: 'Kellan Mercer', position: 'QB', age: 24, teamId: 'BUF',
    capHit: 2_000_000, deadMoney: 400_000, capSavings: 1_600_000, waivers: true,
    experienceYears: 2, rosterBefore: 54, rosterAfter: 53, cutsRemaining: 0, rosterLimit: 53 };
}

function Location() {
  const nav = useNavigationState();
  return <output data-testid="camp-location">{nav.screen}:{nav.params['id']}</output>;
}

export function CampHarness() {
  return <SaveProvider><NavigationProvider initialScreen="camp" rootOf={() => 'team'}>
    <CampScreen /><Location />
  </NavigationProvider></SaveProvider>;
}

export function prepareCampBrowser(): void {
  window.history.replaceState({}, '', '/camp');
  window.localStorage.setItem(OPEN_SAVE_KEY, 'camp-save');
}
