// The scouting board: thirty-two clubs, a search, and eight ways to cut them.
//
// Shared with the play-test rig, like the rest of the boot flow. The board is
// handed its clubs rather than reading them, so the app can fetch them from
// Postgres and the rig from the league it built in the browser, and neither
// build gets its own idea of what the screen looks like.
//
// The chips filter on tags the server worked out over the whole league --
// "the eight with the most cap space" is not a fact any one club knows about
// itself. The search filters on strings, here, as fast as the player types.

import { useState } from 'react';
import { COLOR, R, S, TYPE } from '../app/tokens';
import { ActionButton } from '../components/ActionButton';
import { ChipRow } from '../components/ChipRow';
import { Panel } from '../components/Surface';
import { SearchField } from './searchField';
import { TeamRow } from './teamRow';
import { ALL, FILTER_DETAIL, TEAM_FILTERS, filterTeams } from './teamFilters';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';

export function SelectTeamBoard({ teams, onPick, disabled = false }: {
  readonly teams: readonly TeamProfile[];
  readonly onPick: (teamId: string) => void;
  readonly disabled?: boolean;
}) {
  const [filter, setFilter] = useState<string>(ALL);
  const [query, setQuery] = useState('');
  const shown = filterTeams(teams, filter, query);
  const narrowed = filter !== ALL || query !== '';

  return (
    <>
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[4])}px`, color: COLOR.mut }}>
        Thirty-two fictional franchises. Full rosters. One front office.
        Choose where your dynasty begins.
      </p>

      <div style={{ display: 'grid', gap: S[3], marginBottom: S[3] }}>
        <SearchField
          value={query}
          onChange={setQuery}
          label="Search teams"
          placeholder="Search teams by city, name, or division."
          // Deliberately not "team-search": every row is data-testid="team-<id>",
          // and a control sharing that prefix is picked up by any selector
          // reaching for a row.
          testId="board-search"
        />
        <ChipRow
          chips={TEAM_FILTERS}
          value={filter}
          onChange={setFilter}
          label="Filter teams"
        />
      </div>

      {/* What the chip is actually selecting. A filter whose rule is a secret
          is a filter the player has to reverse-engineer from its results. */}
      <p
        data-testid="filter-detail"
        style={{ ...TYPE.prose, margin: `0 2px ${String(S[3])}px`, color: COLOR.dim, fontSize: 11.5 }}
      >
        {FILTER_DETAIL[filter] ?? 'Every club in the league.'}
        {' '}
        <span className="numeric">
          {shown.length} of {teams.length}.
        </span>
      </p>

      {shown.length === 0 ? (
        <div
          data-testid="no-teams"
          style={{
            padding: `${String(S[6])}px ${String(S[4])}px`,
            textAlign: 'center',
            border: `1px dashed ${COLOR.line}`,
            borderRadius: R.md,
            background: 'rgba(0,0,0,0.12)',
          }}
        >
          <p style={{ ...TYPE.micro, margin: 0, fontSize: 13, color: COLOR.mut }}>
            No teams match this filter
          </p>
          <div style={{ marginTop: S[4], display: 'flex', justifyContent: 'center' }}>
            <ActionButton
              tone="quiet"
              compact
              testId="clear-filters"
              onClick={() => { setFilter(ALL); setQuery(''); }}
            >
              Clear Filters
            </ActionButton>
          </div>
        </div>
      ) : (
        <Panel padded={false}>
          <div style={{ padding: `0 ${String(S[3])}px` }} data-testid="club-list">
            {shown.map((team, i) => (
              <TeamRow
                key={team.teamId}
                team={team}
                last={i === shown.length - 1}
                onSelect={() => { if (!disabled) onPick(team.teamId); }}
              />
            ))}
          </div>
        </Panel>
      )}

      {narrowed && shown.length > 0 && (
        <div style={{ marginTop: S[4], display: 'flex', justifyContent: 'center' }}>
          <ActionButton
            tone="quiet"
            compact
            testId="clear-filters-foot"
            onClick={() => { setFilter(ALL); setQuery(''); }}
          >
            Clear Filters
          </ActionButton>
        </div>
      )}
    </>
  );
}
