// News: what the league is saying.
//
// Its own tab rather than a band halfway down the Office, because it is the
// one part of the product that changes every single week and the one a manager
// checks first. The stories are written by the engine as the season is played
// -- upsets, streaks, milestones, injuries, hot seats, award races -- and this
// screen is the whole feed rather than the six most recent.

import { COLOR, S, TYPE } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { SectionHeader } from '../components/Surface';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { HubStack, NotBuilt } from './hubCards';
import { NewsFeed, feedCount } from './newsFeed';
import { Screen } from './Screen';
import type { OfficeOut } from '../../supabase/functions/_shared/api/reads/office';

export function NewsScreen() {
  const { save, loaded, loadError, version } = useSave();
  const q = useQuery<OfficeOut>('office', { saveId: save?.saveId ?? '' }, version, save !== null);

  if (loadError !== null) return <Screen title="News" screen="news"><QueryError error={loadError} /></Screen>;
  if (!loaded) return <Screen title="News" screen="news"><Loading label="Loading the feed" /></Screen>;
  if (save === null) return <Screen title="News" screen="news"><NoDynasty /></Screen>;

  return (
    <Screen
      title="News"
      subtitle={q.status === 'ready'
        ? `${String(save.season)} · ${feedCount(q.data.news)}`
        : String(save.season)}
      screen="news"
    >
      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && <Loading label="Loading the feed" rows={6} />}
      {q.status === 'ready' && (
        <>
          <NewsFeed items={q.data.news} />

          <SectionHeader title="Also coming here" />
          <HubStack>
            {/* The engine writes six kinds of story today. These are the ones
                the tab is meant to carry and does not yet, named rather than
                quietly missing. */}
            <NotBuilt
              title="Transactions"
              detail="Trades, signings and releases as they happen, from every club."
              testId="soon-transactions"
            />
            <NotBuilt
              title="Owner messages"
              detail="What the owner makes of the job you are doing."
              testId="soon-owner"
            />
            <NotBuilt
              title="Draft buzz"
              detail="Who the league likes, and how that changes through the year."
              testId="soon-draft-buzz"
            />
          </HubStack>

          <p style={{ ...TYPE.prose, margin: `${String(S[4])}px 2px 0`, color: COLOR.dim, fontSize: 11.5 }}>
            Stories are written as the season is simulated. Nothing here is placed by hand.
          </p>
        </>
      )}
    </Screen>
  );
}
