// Office: the news feed, cap position, and the dynasty's history.

import { useState } from 'react';
import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { ActionButton } from '../components/ActionButton';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { NewDynasty } from './NewDynasty';
import { Screen } from './Screen';
import type { OfficeOut } from '../../supabase/functions/_shared/api/reads/office';

const money = (n: number) => `${(n / 1e6).toFixed(1)}M`;

export function OfficeScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, clubsById, version, restart } = useSave();
  const [picking, setPicking] = useState(false);
  const q = useQuery<OfficeOut>('office', { saveId: save?.saveId ?? '' }, version, save !== null);

  return (
    <Screen title="Office" subtitle={save === null ? '' : String(save.season)} screen="office">
      {loadError !== null && <QueryError error={loadError} />}
      {loaded && save === null && <NoDynasty />}
      {save !== null && q.status === 'error' && <QueryError error={q.error} />}
      {save !== null && q.status === 'loading' && <Loading label="Loading office" rows={8} />}
      {save !== null && q.status === 'ready' && (
        <>
          <SectionHeader title="Salary cap" />
          {q.data.cap === null ? (
            <EmptyState title="No cap sheet for this season" />
          ) : (
            <StatTiles
              stats={[
                { label: 'Cap', value: money(q.data.cap.capLimit) },
                { label: 'Committed', value: money(q.data.cap.committed) },
                {
                  label: 'Space',
                  value: money(q.data.cap.available),
                  tone: q.data.cap.available < 0 ? 'negative' : 'positive',
                },
              ]}
            />
          )}

          <SectionHeader title="News" />
          {q.data.news.length === 0 ? (
            <EmptyState title="Nothing has happened yet" detail="Stories appear as the season is played." />
          ) : (
            <Panel padded={false}>
              <div style={{ padding: '0 12px' }} data-testid="news-feed">
                {q.data.news.map((item) => (
                  <ListRow
                    key={item.newsId}
                    title={item.headline}
                    subtitle={`Wk ${String(item.week ?? '—')} · ${item.category.replace('_', ' ').toLowerCase()}`}
                    {...(item.body === null ? {} : { trailing: <Caption>{String(item.importance)}</Caption> })}
                  />
                ))}
              </div>
            </Panel>
          )}

          <SectionHeader title="Dynasty history" />
          {q.data.history.length === 0 ? (
            <EmptyState title="No completed seasons yet" />
          ) : (
            <Panel padded={false}>
              <div style={{ padding: '0 12px' }}>
                {q.data.history.map((h) => (
                  <ListRow
                    key={h.season}
                    title={String(h.season)}
                    subtitle={clubsById.get(save.userTeamId)?.name ?? save.userTeamId}
                    trailing={<Caption>{`${String(h.wins)}-${String(h.losses)}${h.ties > 0 ? `-${String(h.ties)}` : ''}`}</Caption>}
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
                navigable
                onSelect={() => { nav.replaceRoot('roster'); }}
              />
            </div>
          </Panel>

          <div style={{ marginTop: 18 }}>
            {picking ? (
              <NewDynasty onPick={(teamId) => restart(teamId)} />
            ) : (
              <ActionButton onClick={() => { setPicking(true); }} tone="quiet" testId="restart">
                Start a new dynasty
              </ActionButton>
            )}
            <p style={{ margin: '8px 0 0', color: COLOR.dim, fontSize: 11, lineHeight: 1.5 }}>
              Deletes this dynasty on the server and starts another.
            </p>
          </div>
        </>
      )}
    </Screen>
  );
}
