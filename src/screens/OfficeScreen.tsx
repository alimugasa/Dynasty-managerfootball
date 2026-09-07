// Office: the news feed, cap position, and the season's history.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { ActionButton } from '../game/Button';
import { useGame } from '../game/GameProvider';
import { capFor, capLimit, recordOf, squadOf } from '../game/store';
import { Screen } from './Screen';

const money = (n: number) => `${(n / 1e6).toFixed(1)}M`;

export function OfficeScreen() {
  const nav = useNavigator();
  const { state, restart } = useGame();
  const squad = squadOf(state, state.userTeamId);
  const sheet = capFor(state, state.userTeamId);

  const feed = [...state.news].reverse();
  const history = [...state.history]
    .filter((h) => h.teamId === state.userTeamId)
    .sort((a, b) => b.season - a.season);

  return (
    <Screen title="Office" subtitle={String(state.season)} screen="office">
      <SectionHeader title="Salary cap" />
      <StatTiles
        stats={[
          { label: 'Cap', value: money(capLimit(state.season)) },
          { label: 'Committed', value: money(sheet.committed) },
          {
            label: 'Space',
            value: money(sheet.available),
            tone: sheet.available < 0 ? 'negative' : 'positive',
          },
        ]}
      />

      <SectionHeader title="News" />
      {feed.length === 0 ? (
        <EmptyState
          title="Nothing has happened yet"
          detail="Stories appear as the season is played."
        />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="news-feed">
            {feed.slice(0, 40).map((item, i) => (
              <ListRow
                key={`${String(item.week)}-${String(i)}-${item.headline}`}
                title={item.headline}
                subtitle={`Wk ${String(item.week)} · ${item.category.replace('_', ' ').toLowerCase()}`}
                {...(item.body === null
                  ? {}
                  : { trailing: <Caption>{String(item.importance)}</Caption> })}
              />
            ))}
          </div>
        </Panel>
      )}

      <SectionHeader title="Dynasty history" />
      {history.length === 0 ? (
        <EmptyState title="No completed seasons yet" />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            {history.map((h) => (
              <ListRow
                key={h.season}
                title={String(h.season)}
                subtitle={state.identities.get(h.teamId)?.name ?? h.teamId}
                trailing={<Caption>{recordOf({ ...h, pointsFor: 0, pointsAgainst: 0, streak: 0 })}</Caption>}
              />
            ))}
          </div>
        </Panel>
      )}

      <SectionHeader title="Squad" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          <ListRow
            title="Full roster and depth chart"
            subtitle={`${String(squad.length)} players`}
            navigable
            onSelect={() => { nav.replaceRoot('roster'); }}
          />
        </div>
      </Panel>

      <div style={{ marginTop: 18 }}>
        <ActionButton onClick={() => { restart(); }} tone="quiet" testId="restart">
          Start a new dynasty
        </ActionButton>
        <p style={{ margin: '8px 0 0', color: COLOR.dim, fontSize: 11, lineHeight: 1.5 }}>
          Wipes the saved game in this browser.
        </p>
      </div>
    </Screen>
  );
}
