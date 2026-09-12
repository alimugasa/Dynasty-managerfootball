// Table `news` — primary key (save_id, news_id).
//
// The stored row. The engine emits everything except the three columns the
// server owns: save_id, news_id and published_at. Kept in src/domain rather than
// imported from the engine because the app reads these rows from the database
// and never runs the generator -- ARCHITECTURE.md rule 2.

export const NEWS_CATEGORIES = [
  'UPSET', 'STREAK', 'MILESTONE', 'INJURY', 'HOT_SEAT', 'AWARD_RACE',
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export interface News {
  save_id: string;
  news_id: number;
  season: number;
  week: number | null;
  phase: string | null;
  published_at: string;
  category: string;
  headline: string;
  body: string | null;
  team_id: string | null;
  player_id: string | null;
  game_id: string | null;
  importance: number;
}

export const NEWS_CATEGORY_LABEL: Record<NewsCategory, string> = {
  UPSET: 'Upset',
  STREAK: 'Streak',
  MILESTONE: 'Milestone',
  INJURY: 'Injury',
  HOT_SEAT: 'Hot seat',
  AWARD_RACE: 'Award race',
};
