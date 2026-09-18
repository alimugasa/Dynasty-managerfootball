import { SaveProvider, OPEN_SAVE_KEY } from '../../src/app/SaveProvider';
import { NavigationProvider } from '../../src/app/NavigationProvider';
import { useNavigationState } from '../../src/app/navigation';
import { AwardRacesScreen, PlayoffPictureScreen, TeamRankingsScreen } from '../../src/screens/LeagueIntelligenceScreen';
import type { LeagueIntelligenceOut } from '../../supabase/functions/_shared/api/reads/leagueIntelligence';
import { RACES, type RaceCandidate } from '../../supabase/functions/_shared/api/leagueIntelligence/awardModel';
import { rankTeams } from '../../supabase/functions/_shared/api/leagueIntelligence/teamRankings';

export function intelligenceFixture(): LeagueIntelligenceOut {
  const player: RaceCandidate = { playerId: 'ari', name: 'Ari Vale', teamId: 'BUF', position: 'QB', group: 'QB',
    experience: 0, games: 8, passYards: 2300, passAttempts: 270, passTD: 18, thrownINT: 3,
    rushYards: 50, rushes: 10, rushTD: 1, recYards: 0, targets: 0, recTD: 0, tackles: 0, sacks: 0, interceptions: 0,
    rank: 1, index: 82, movement: 'UP', places: 2, evidence: '2300 pass yd · 18 pass TD · 3 INT' };
  return {
    userTeamId: 'BUF',
    calendar: { season: 2027, phase: 'REGULAR_SEASON', weeks: 18, throughWeek: 9,
      awardFromWeek: 6, pictureFromWeek: 9, awardsActive: true, pictureActive: true, lateSeason: false },
    rankings: rankTeams(['BUF', 'CLE'].map((teamId, i) => ({ teamId, name: teamId === 'BUF' ? 'Buffalo Stampede' : 'Cleveland Ironmen', games: 8,
      totals: { offense: 3200 - i * 500, defense: 3000 - i * 500, scoring: 210, allowed: 190, passing: 2400,
        rushing: 800, passDefense: 2200, rushDefense: 800, turnovers: 4 } }))),
    races: RACES.map((r) => ({ code: r.code, name: r.name, candidates: Array.from({ length: 5 }, (_, i) => ({
      ...player, playerId: i === 0 ? 'ari' : 'candidate-' + String(i), name: i === 0 ? 'Ari Vale' : 'Candidate ' + String(i),
      rank: i + 1, index: 82 - i,
    })) })),
    picture: { qualifiers: 1, tiebreakers: ['Win percentage', 'Head to head'], conferences: [
      { id: 'A', name: 'Alpha Conference', teams: [{ teamId: 'CLE', name: 'Cleveland Ironmen', division: 'North',
        divisionRank: 1, conferenceRank: 1, seed: 1, wins: 6, losses: 2, ties: 0, remaining: 9, gamesBack: null, status: 'DIVISION LEADER' }] },
      { id: 'B', name: 'Beta Conference', teams: [{ teamId: 'BUF', name: 'Buffalo Stampede', division: 'East',
        divisionRank: 2, conferenceRank: 3, seed: null, wins: 4, losses: 4, ties: 0, remaining: 9, gamesBack: 2, status: 'CHASING' }] },
    ] },
  };
}
function Location() {
  const s = useNavigationState();
  return <output data-testid="location">{s.screen}:{s.params['id']}</output>;
}
export function IntelligenceHarness({ mode }: { readonly mode: 'picture' | 'races' | 'rankings' }) {
  return <SaveProvider><NavigationProvider initialScreen="league" rootOf={() => 'league'}>
    {mode === 'picture' ? <PlayoffPictureScreen /> : mode === 'races' ? <AwardRacesScreen /> : <TeamRankingsScreen />}
    <Location />
  </NavigationProvider></SaveProvider>;
}
export function prepare() {
  window.history.replaceState({}, '', '/league');
  localStorage.setItem(OPEN_SAVE_KEY, 'camp-save');
}
