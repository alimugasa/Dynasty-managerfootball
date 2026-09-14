// News, in the play-test build: the same feed, from the same components.
//
// The rig has no database, so the three things the server supplies -- a row
// id, a published timestamp and read state -- are supplied here instead: the
// id is the story's place in the list, the timestamp is the moment it was
// written, and read state is a set held in the game the same way the standings
// are. Everything else is genuinely shared: the four opening stories, the
// weekly result story, the filters, the accent rules and the card itself all
// come from the modules the app uses, so a change to any of them shows up in
// both builds or in neither.

import { useState } from 'react';
import { S } from '../../src/app/tokens';
import { ChipRow, type Chip } from '../../src/components/ChipRow';
import { EmptyState } from '../../src/components/Surface';
import { clubAccent, NewsCard } from '../../src/screens/newsCard';
import {
  CHIP_LABEL, CHIP_UNWRITTEN, NEWS_CHIPS, chipCounts, matchesChip, type NewsChip,
} from '../../supabase/functions/_shared/api/newsFilters.ts';
import {
  openingStories, resultStory, type ClubName, type NewsRow,
} from '../../supabase/functions/_shared/api/franchiseNews.ts';
import {
  overallRating, ownerMandate, quarterbackSituation,
} from '../../supabase/functions/_shared/api/reads/teamOutlook.ts';
import type { FeedItem } from '../../supabase/functions/_shared/api/reads/news.ts';
import { openingAbsences, owners } from './world.ts';
import { ratingsOf } from './dashboard.tsx';
import { capFor, type Game, type PlayedGame, type Standing } from './host.ts';

const nameOf = (game: Game, teamId: string): ClubName | null => {
  const club = game.clubs.get(teamId);
  return club === undefined
    ? null : { teamId, metro: club.metro, nickname: club.nickname };
};

/**
 * The four stories a rig dynasty opens with.
 *
 * Every fact comes from the same place the app's would: the club's own row,
 * the seed's owner table, the roster the league was just built with, the
 * injury list the season opens on, and the week 1 fixture. The mandate is the
 * same derivation the rig's own dashboard prints, so the story and the Owner
 * Goal card agree here exactly as they do in the app.
 */
export function openingNews(game: Game, gmName: string | null): readonly NewsRow[] {
  const club = nameOf(game, game.userTeamId);
  if (club === null) return [];
  const owner = owners().get(game.userTeamId);
  const patience = owner?.['patience'] === undefined ? null : Number(owner['patience']);
  const roster = game.league.players.filter((p) => p.teamId === game.userTeamId && !p.retired);
  const passers = [...roster].filter((p) => p.group === 'QB').sort((a, b) => b.ability - a.ability);
  const ages = roster.map((p) => p.age);
  const rated = ratingsOf(game, game.userTeamId);
  const absent = openingAbsences();
  const fixture = game.schedule.find((f) => f.week === 1
    && (f.homeTeamId === game.userTeamId || f.awayTeamId === game.userTeamId));
  const opponentId = fixture === undefined
    ? null
    : fixture.homeTeamId === game.userTeamId ? fixture.awayTeamId : fixture.homeTeamId;
  const opponent = opponentId === null ? null : nameOf(game, opponentId);

  return openingStories({
    season: game.season,
    club,
    gmName: gmName === null || gmName === '' ? null : gmName,
    ownerName: owner?.['owner_name'] ?? null,
    // The seed's owner rows carry no tenure, so none is claimed. The app reads
    // one from Postgres and prints it; here the sentence stops a clause early,
    // which is the honest version of not knowing.
    ownerTenure: null,
    mandate: ownerMandate({
      patience,
      winNowBias: owner?.['win_now_bias'] === undefined ? null : Number(owner['win_now_bias']),
      overall: overallRating(rated.offense, rated.defense, rated.specialTeams),
      averageAge: ages.length === 0
        ? null : Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10,
      capSpace: capFor(game, game.userTeamId).available,
      quarterback: quarterbackSituation(
        passers[0]?.ability ?? null,
        passers[0]?.age === undefined ? null : Math.round(passers[0].age),
        passers[1]?.ability ?? null),
    }),
    rosterCount: roster.length,
    campInjuries: roster.filter((p) => absent.has(p.id)).length,
    opener: fixture === undefined || opponent === null ? null : {
      // The rig plays fixtures out of a list rather than out of a table of
      // game ids, so the id is the one the week runner will use for this game.
      gameId: `${String(game.season)}-1-${fixture.homeTeamId}-${fixture.awayTeamId}`,
      opponent,
      home: fixture.homeTeamId === game.userTeamId,
      neutral: false,
    },
  });
}

/** The club's own result, once the week has been played. Null on a bye. */
export function resultNews(
  game: Game, week: number, played: readonly PlayedGame[],
  standings: ReadonlyMap<string, Standing>,
): NewsRow | null {
  const game_ = played.find((g) => g.homeTeamId === game.userTeamId
    || g.awayTeamId === game.userTeamId);
  const standing = standings.get(game.userTeamId);
  if (game_ === undefined || standing === undefined) return null;
  const home = game_.homeTeamId === game.userTeamId;
  const club = nameOf(game, game.userTeamId);
  const opponent = nameOf(game, home ? game_.awayTeamId : game_.homeTeamId);
  if (club === null || opponent === null) return null;
  return resultStory({
    season: game.season, week, phase: 'REGULAR_SEASON', club, opponent,
    gameId: game_.gameId,
    ourScore: home ? game_.homeScore : game_.awayScore,
    theirScore: home ? game_.awayScore : game_.homeScore,
    home, overtime: game_.overtime,
    wins: standing.wins, losses: standing.losses, ties: standing.ties,
  });
}

/**
 * The stored rows as the card reads them.
 *
 * The index is the id. It is stable for the life of a dynasty because stories
 * are only ever appended, never inserted or removed -- the same property the
 * database's identity column has, arrived at differently.
 */
function feedItems(game: Game): readonly FeedItem[] {
  const played = new Set(game.results.map((g) => g.gameId));
  return game.news.map((n, i): FeedItem => ({
    newsId: i,
    season: n.season, week: n.week, phase: n.phase,
    category: n.category, headline: n.headline, body: n.body,
    importance: n.importance,
    teamId: n.teamId,
    teamName: n.teamId === null ? null : game.clubs.get(n.teamId)?.name ?? null,
    playerId: n.playerId,
    playerName: n.playerId === null
      ? null : game.league.players.find((p) => p.id === n.playerId)?.name ?? null,
    gameId: n.gameId,
    gamePlayed: n.gameId !== null && played.has(n.gameId),
    // The rig keeps no clock of its own; the story's place in the season is
    // what the card shows, and this field is not one of them.
    publishedAt: '',
    readAt: game.newsRead.has(i) ? 'read' : null,
  })).reverse();
}

export function RigNewsScreen({ game, onRead, open }: {
  readonly game: Game;
  readonly onRead: (newsId: number) => void;
  readonly open: (screen: string, id: string) => void;
}) {
  const [chip, setChip] = useState<NewsChip>('ALL');
  const [opened, setOpened] = useState<number | null>(null);
  const items = feedItems(game);
  const counts = chipCounts(items, game.userTeamId);
  const shown = items.filter((i) => matchesChip(chip, i, game.userTeamId));
  const chips: readonly Chip[] = NEWS_CHIPS.map((key) => ({
    key, label: `${CHIP_LABEL[key]} ${String(counts[key])}`,
  }));

  return (
    <>
      <ChipRow
        chips={chips}
        value={chip}
        onChange={(key) => {
          const next = NEWS_CHIPS.find((c) => c === key);
          if (next !== undefined) setChip(next);
        }}
        label="Filter news"
      />
      {shown.length === 0 ? (
        <div style={{ marginTop: S[4] }}>
          <EmptyState
            title={chip === 'ALL'
              ? 'Nothing has happened yet'
              : `No ${CHIP_LABEL[chip].toLowerCase()} stories yet`}
            detail={CHIP_UNWRITTEN[chip]
              ?? (chip === 'ALL'
                ? 'Stories appear as the season is played.'
                : 'Nothing under this filter this season. Try All.')}
          />
        </div>
      ) : (
        <div data-testid="news-feed" style={{ display: 'grid', gap: S[3], marginTop: S[4] }}>
          {shown.map((item) => (
            <NewsCard
              key={item.newsId}
              item={item}
              userTeamId={game.userTeamId}
              teamColour={item.teamId === null ? null : clubAccent(
                game.clubs.get(item.teamId)?.primary ?? null,
                game.clubs.get(item.teamId)?.secondary ?? null)}
              unread={item.readAt === null}
              expanded={opened === item.newsId}
              onToggle={() => {
                const opening = opened !== item.newsId;
                setOpened(opening ? item.newsId : null);
                if (opening) onRead(item.newsId);
              }}
              onOpen={(screen, params) => { open(screen, params['id'] ?? ''); }}
            />
          ))}
        </div>
      )}
    </>
  );
}
