// News: what the league is saying, and what it said to you first.
//
// Its own tab rather than a band halfway down the Office, because it is the
// one part of the product that changes every single week and the one a manager
// checks first. Two kinds of story share the feed: the league's, written by
// the engine as weeks are played -- upsets, streaks, milestones, injuries, hot
// seats -- and the front office's own, written when the dynasty is created and
// after each of its games.
//
// The tab reads the feed and nothing else. Which stories exist, what they say,
// which club each is about and whether it has been opened are all the server's
// answers (ARCHITECTURE.md rule 2); this screen decides only which of them are
// on screen and how they are drawn.
//
// Opening a card marks it read, and that is a write. It is fired and not
// awaited: the dot clears on tap because the card is open, and a feed whose
// unread marks waited on a round trip would feel broken on a train.

import { useCallback, useState } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { useNavigator } from '../app/navigation';
import { useQuery } from '../hooks/useQuery';
import { ChipRow, type Chip } from '../components/ChipRow';
import { EmptyState, SectionHeader } from '../components/Surface';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { clubAccent, NewsCard } from './newsCard';
import { Screen } from './Screen';
import {
  CHIP_LABEL, CHIP_UNWRITTEN, NEWS_CHIPS, chipCounts, matchesChip, type NewsChip,
} from '../../supabase/functions/_shared/api/newsFilters';
import type { FeedItem, NewsOutput } from '../../supabase/functions/_shared/api/reads/news';

/** The subtitle: the season, and how much of the feed is still unopened. */
function unreadLine(season: number, unread: number, total: number): string {
  if (total === 0) return String(season);
  if (unread === 0) return `${String(season)} · all caught up`;
  return `${String(season)} · ${String(unread)} unread`;
}

/** What an empty list means, which depends entirely on which chip emptied it. */
function emptyFor(chip: NewsChip): { title: string; detail: string } {
  const unwritten = CHIP_UNWRITTEN[chip];
  // Two of the chips have nothing behind them in this build. Saying so is the
  // difference between a filter that found nothing and a feature that does not
  // exist yet, and a player deserves to know which one they are looking at.
  if (unwritten !== undefined) {
    return { title: `No ${CHIP_LABEL[chip].toLowerCase()} stories`, detail: unwritten };
  }
  if (chip === 'ALL') {
    return {
      title: 'Nothing has happened yet',
      detail: 'Stories appear as the season is played.',
    };
  }
  return {
    title: `No ${CHIP_LABEL[chip].toLowerCase()} stories yet`,
    detail: 'Nothing under this filter this season. Try All.',
  };
}

export function NewsScreen() {
  const { save, loaded, loadError, clubsById, version, markNewsRead } = useSave();
  const nav = useNavigator();
  // The stories opened since this feed was read, so a dot clears on the tap
  // rather than on the round trip. The server is still the authority: the next
  // read of the feed replaces these with its own read_at times, and a mark that
  // failed to land comes back unread, which is what it is.
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set());
  const [chip, setChip] = useState<NewsChip>('ALL');
  const [open, setOpen] = useState<number | null>(null);

  const q = useQuery<NewsOutput>(
    'news', { saveId: save?.saveId ?? '' }, version, save !== null);

  const markRead = useCallback((item: FeedItem) => {
    if (item.readAt !== null) return;
    setOpened((held) => new Set(held).add(item.newsId));
    markNewsRead(item.newsId).catch(() => {
      // Put the dot back. The story is still unread on the server, and a feed
      // that said otherwise would be lying about what it will show next time.
      setOpened((held) => {
        const next = new Set(held);
        next.delete(item.newsId);
        return next;
      });
    });
  }, [markNewsRead]);

  if (loadError !== null) {
    return <Screen title="News" screen="news"><QueryError error={loadError} /></Screen>;
  }
  if (!loaded) {
    return <Screen title="News" screen="news"><Loading label="Loading the feed" /></Screen>;
  }
  if (save === null) return <Screen title="News" screen="news"><NoDynasty /></Screen>;

  const data = q.status === 'ready' ? q.data : null;
  /** Unread as the screen knows it: what the server said, less this session's
   *  taps. One function, used by the dots and by the count above them, so the
   *  two cannot disagree. */
  const isUnread = (item: FeedItem): boolean =>
    item.readAt === null && !opened.has(item.newsId);
  const counts = data === null
    ? null : chipCounts(data.items, data.userTeamId);
  const shown = data === null
    ? [] : data.items.filter((i) => matchesChip(chip, i, data.userTeamId));
  // Counted from the list on screen rather than taken from the response, which
  // was true when it was sent and is one tap out of date the moment a card is
  // opened.
  const unread = data === null ? 0 : data.items.filter(isUnread).length;
  // The count rides on the chip rather than sitting under it, so the row still
  // fits a 320px screen. A chip with nothing behind it says 0 rather than
  // hiding, because a filter that disappears when it is empty cannot be used
  // to find out that it is empty.
  const chips: readonly Chip[] = NEWS_CHIPS.map((key) => ({
    key,
    label: counts === null
      ? CHIP_LABEL[key] : `${CHIP_LABEL[key]} ${String(counts[key])}`,
  }));

  return (
    <Screen
      title="News"
      subtitle={data === null
        ? String(save.season)
        : unreadLine(data.season, unread, data.items.length)}
      screen="news"
    >
      {q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
      {q.status === 'loading' && <Loading label="Loading the feed" rows={6} />}
      {data !== null && (
        <>
          <ChipRow
            chips={chips}
            value={chip}
            onChange={(key) => {
              // Unknown keys cannot happen -- the row is built from NEWS_CHIPS
              // -- but the cast is the only place that would hide it if they
              // could, so the filter is applied rather than assumed.
              const next = NEWS_CHIPS.find((c) => c === key);
              if (next !== undefined) setChip(next);
            }}
            label="Filter news"
          />

          {shown.length === 0 ? (
            <div style={{ marginTop: S[4] }} data-testid="news-empty">
              <EmptyState {...emptyFor(chip)} />
            </div>
          ) : (
            <div
              data-testid="news-feed"
              style={{ display: 'grid', gap: S[3], marginTop: S[4] }}
            >
              {shown.map((item) => (
                <NewsCard
                  key={item.newsId}
                  item={item}
                  userTeamId={data.userTeamId}
                  teamColour={item.teamId === null ? null : clubAccent(
                    clubsById.get(item.teamId)?.primary ?? null,
                    clubsById.get(item.teamId)?.secondary ?? null)}
                  unread={isUnread(item)}
                  expanded={open === item.newsId}
                  onToggle={() => {
                    const opening = open !== item.newsId;
                    setOpen(opening ? item.newsId : null);
                    if (opening) markRead(item);
                  }}
                  onOpen={(screen, params, root) => {
                    if (root) nav.replaceRoot(screen, params);
                    else nav.push(screen, params);
                  }}
                />
              ))}
            </div>
          )}

          <SectionHeader title="About this feed" />
          <p style={{ ...TYPE.prose, margin: '0 2px', color: COLOR.dim, fontSize: 12 }}>
            Stories are written when the franchise is created and as each week is
            simulated. Nothing here is placed by hand, and a story only carries a
            button when there is a screen behind it.
          </p>
        </>
      )}
    </Screen>
  );
}
