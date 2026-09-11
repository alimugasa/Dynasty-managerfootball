// Office: the news feed, cap position, and the dynasty's history.

import { COLOR, R, S, TYPE, tint } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { ActionButton } from '../components/ActionButton';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import type { OfficeOut } from '../../supabase/functions/_shared/api/reads/office';

const money = (n: number) => `${(n / 1e6).toFixed(1)}M`;

// A story is one of six kinds and the kind changes how you read the headline:
// an injury is bad news whoever it happened to, a milestone is not. A dot in
// the kind's colour says which before the eye reaches the words, and costs a
// row eight pixels rather than a second line of text.
const NEWS_TONE: Readonly<Record<string, string>> = {
  UPSET: COLOR.violet,
  STREAK: COLOR.teal,
  MILESTONE: COLOR.amber,
  INJURY: COLOR.red,
  HOT_SEAT: '#D9743F',
  AWARD_RACE: COLOR.blue,
};

/** Sentence case from a SCREAMING_SNAKE category, for reading rather than parsing. */
const kindLabel = (category: string): string => {
  const words = category.toLowerCase().split('_');
  const [first = '', ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
};

function NewsDot({ category }: { readonly category: string }) {
  // An unlisted category is drawn in the neutral grey rather than guessed at.
  const colour = NEWS_TONE[category] ?? COLOR.dim;
  return (
    <span
      aria-hidden="true"
      style={{
        width: 8, height: 8, borderRadius: R.pill, flexShrink: 0,
        background: colour, boxShadow: `0 0 0 3px ${tint(colour, 0.16)}`,
      }}
    />
  );
}

export function OfficeScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, clubsById, version, leaveSave } = useSave();
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
                {
                  label: 'Committed',
                  value: money(q.data.cap.committed),
                  // How much of the cap is spent is the actual question; the
                  // meter answers it without arithmetic. Guarded because a cap
                  // of zero would be a divide by zero, not a full bar.
                  ...(q.data.cap.capLimit > 0
                    ? { fill: q.data.cap.committed / q.data.cap.capLimit }
                    : {}),
                },
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
              <div style={{ padding: `0 ${String(S[3])}px` }} data-testid="news-feed">
                {q.data.news.map((item) => (
                  <ListRow
                    key={item.newsId}
                    leading={<NewsDot category={item.category} />}
                    title={item.headline}
                    subtitle={item.week === null
                      ? kindLabel(item.category)
                      : `Week ${String(item.week)} · ${kindLabel(item.category)}`}
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
              <div style={{ padding: `0 ${String(S[3])}px` }}>
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

          <SectionHeader title="The franchise" />
          <Panel padded={false}>
            <div style={{ padding: `0 ${String(S[3])}px` }}>
              <ListRow
                title="Season recap"
                subtitle="Champions, awards, all-league, the record book"
                navigable
                onSelect={() => { nav.push('recap'); }}
              />
              <ListRow
                title="Coaching staff"
                subtitle="Who calls the plays and develops your players"
                navigable
                onSelect={() => { nav.push('staff'); }}
              />
              <ListRow
                title="Full roster and depth chart"
                navigable
                onSelect={() => { nav.replaceRoot('roster'); }}
              />
            </div>
          </Panel>

          <div style={{ marginTop: S[5] }}>
            <ActionButton
              onClick={() => { leaveSave(); }}
              tone="quiet"
              testId="to-menu"
            >
              Main menu
            </ActionButton>
            <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0 0`, color: COLOR.dim, fontSize: 11.5 }}>
              Closes this dynasty and returns to the save files. Nothing is deleted; the
              server keeps it exactly where you left it.
            </p>
          </div>
        </>
      )}
    </Screen>
  );
}
