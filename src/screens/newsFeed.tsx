// The news feed, and the dot that says what kind of story each item is.
//
// Lifted out of the Office screen when News became a tab of its own. It lives
// in its own module rather than inside either screen because both the feed and
// the Office's summary of it want the same colours and the same labels, and a
// category that meant one thing in two places would be worse than no colour.

import { COLOR, R, S, TYPE, tint } from '../app/tokens';
import { EmptyState, Panel } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import type { NewsOut } from '../../supabase/functions/_shared/api/reads/office';

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
export const kindLabel = (category: string): string => {
  const words = category.toLowerCase().split('_');
  const [first = '', ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
};

export function NewsDot({ category }: { readonly category: string }) {
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

export function NewsFeed({ items, limit }: {
  readonly items: readonly NewsOut[];
  /** How many to show. Omitted for the whole feed. */
  readonly limit?: number;
}) {
  const shown = limit === undefined ? items : items.slice(0, limit);
  if (shown.length === 0) {
    return (
      <EmptyState
        title="Nothing has happened yet"
        detail="Stories appear as the season is played."
      />
    );
  }
  return (
    <Panel padded={false}>
      <div style={{ padding: `0 ${String(S[3])}px` }} data-testid="news-feed">
        {shown.map((item) => (
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
  );
}

/** How many stories the feed is carrying, said the way a feed says it. */
export function feedCount(items: readonly NewsOut[]): string {
  if (items.length === 0) return 'No stories yet';
  return `${String(items.length)} ${items.length === 1 ? 'story' : 'stories'}`;
}

export const FEED_NOTE = {
  ...TYPE.prose, color: COLOR.dim, fontSize: 11.5,
} as const;
