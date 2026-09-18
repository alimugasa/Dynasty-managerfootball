// The News tab's read: the whole feed for the open season, with read state.
//
// Its own route rather than a widening of `office`, because the two want
// different things. The Office shows the six most recent headlines and needs
// nothing else; the tab needs every story, the club each is about, the body
// in full, and whether it has been opened. Loading forty bodies on a screen
// that prints six of their headlines is the kind of quiet waste that only
// shows up on a slow connection.
//
// The club names are resolved here rather than on the client. The client holds
// `clubsById` and could do it, but a story about a club that has since been
// relocated or renamed should read the way it read when it was written, and
// the join is the only thing that can promise that.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';

export interface NewsIn { readonly saveId: string }

export interface FeedItem {
  readonly newsId: number;
  readonly season: number;
  readonly week: number | null;
  readonly phase: string | null;
  readonly category: string;
  readonly headline: string;
  readonly body: string | null;
  readonly importance: number;
  /** The club the story is about, or null for a league-wide one. */
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly playerId: string | null;
  readonly playerName: string | null;
  /** The game behind the story, when there is one. What makes a View Matchup
   *  button possible, and its absence is what makes one impossible. */
  readonly gameId: string | null;
  /** Whether that game has a box score yet.
   *
   *  The Game screen reads `game_results`, so a fixture that has not been
   *  played is not a destination: a button pointing at one would 404 on tap.
   *  The week 1 preview written on creation is exactly that case, so the fact
   *  is read here rather than guessed at from the category. */
  readonly gamePlayed: boolean;
  /** ISO 8601. When the story was written, not when it was read. */
  readonly publishedAt: string;
  /** When the player opened it, or null if they have not. */
  readonly readAt: string | null;
}

export interface NewsOutput {
  /** Newest first. The whole season, not a window: the tab is the feed. */
  readonly items: readonly FeedItem[];
  /** Which club is being managed, so Team and League mean something. */
  readonly userTeamId: string;
  readonly season: number;
  /** Counted in Postgres rather than from `items`, so it stays right if the
   *  list is ever capped. */
  readonly unread: number;
}

interface Row {
  news_id: string; season: number; week: number | null; phase: string | null;
  category: string; headline: string; body: string | null; importance: number;
  team_id: string | null; team_name: string | null;
  player_id: string | null; player_name: string | null;
  game_id: string | null; game_played: boolean;
  published_at: string; read_at: string | null;
}

export const news: Handler<NewsIn, NewsOutput> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const [rows, unread] = await Promise.all([
      sql<Row[]>`
        select n.news_id::text, n.season, n.week, n.phase, n.category, n.headline,
               n.body, n.importance, n.team_id,
               case when t.team_id is null then null
                    else t.metro_area || ' ' || t.nickname end as team_name,
               n.player_id, p.display_name as player_name, n.game_id,
               (g.game_id is not null) as game_played,
               to_char(n.published_at at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS"Z"') as published_at,
               case when n.read_at is null then null
                    else to_char(n.read_at at time zone 'UTC',
                                 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end as read_at
          from public.news n
          left join public.teams t on t.save_id = n.save_id and t.team_id = n.team_id
          left join public.players p on p.save_id = n.save_id and p.player_id = n.player_id
          left join public.game_results g on g.save_id = n.save_id and g.game_id = n.game_id
         where n.save_id = ${s.id} and n.season = ${s.season}
         order by n.news_id desc`,
      sql<{ n: string }[]>`
        select count(*)::text as n from public.news
         where save_id = ${s.id} and season = ${s.season} and read_at is null`,
    ]);

    return {
      season: s.season,
      userTeamId: s.user_team_id,
      unread: Number(unread[0]?.n ?? 0),
      items: rows.map((r) => ({
        newsId: Number(r.news_id),
        season: r.season, week: r.week, phase: r.phase,
        category: r.category, headline: r.headline, body: r.body,
        importance: r.importance,
        teamId: r.team_id, teamName: r.team_name,
        playerId: r.player_id, playerName: r.player_name,
        gameId: r.game_id, gamePlayed: r.game_played,
        publishedAt: r.published_at, readAt: r.read_at,
      })),
    };
  },
};
