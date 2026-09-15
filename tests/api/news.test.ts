// The News tab's feed, against Postgres.
//
// Two claims are worth a database to check. The first is that a brand new
// franchise is not empty: creating a save writes four stories, and they name
// the GM the player typed and the club they picked rather than a placeholder.
// The second is that read state persists -- the whole reason it is a column
// and not a browser key.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { NewsOutput } from '../../supabase/functions/_shared/api/reads/news';
import type { MarkNewsReadOut } from '../../supabase/functions/_shared/api/markNewsRead';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import { matchesChip } from '../../supabase/functions/_shared/api/newsFilters';

const OWNER = '77777777-0000-0000-0000-0000000000e1';

describe('the news feed', () => {
  let pipe: Pipe;
  let saveId = '';

  const feed = (): Promise<NewsOutput> => pipe.api.call<NewsOutput>('news', { saveId });

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    await pipe.sql`delete from public.saves where user_id = ${OWNER} and not is_template`;
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Feed dynasty', teamId: 'CLE', slot: 1,
      gmFirstName: 'Marcus', gmLastName: 'Bellweather',
    });
    saveId = out.saveId;
  }, 300_000);

  afterAll(async () => {
    if (saveId !== '') await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  }, 300_000);

  it('opens a new franchise with four stories, not an empty feed', async () => {
    const out = await feed();
    expect(out.items).toHaveLength(4);
    expect(out.unread).toBe(4);
    // All four are about the club being managed, and all four are unread.
    expect(out.items.every((i) => i.teamId === out.userTeamId)).toBe(true);
    expect(out.items.every((i) => i.readAt === null)).toBe(true);
    expect([...out.items].map((i) => i.category).sort()).toEqual(
      ['CAMP', 'FRANCHISE', 'MATCHUP', 'OWNER']);
  });

  it('names the GM the player typed and the club they picked', async () => {
    const out = await feed();
    const appointment = out.items.find((i) => i.category === 'FRANCHISE');
    expect(appointment?.headline).toContain('Marcus Bellweather');
    // The club's own nickname, from its identity row -- not the team id.
    const club = out.items[0]?.teamName ?? '';
    expect(club).not.toBe('');
    expect(appointment?.body ?? '').toContain(club);
  });

  it('previews week 1 against a real opponent, with the game behind it', async () => {
    const out = await feed();
    const opener = out.items.find((i) => i.category === 'MATCHUP');
    // The seed ships a schedule, so this is the preview rather than the
    // "being prepared" story -- and a preview must carry the game it previews,
    // because that is what makes a View Matchup button possible.
    expect(opener?.gameId).not.toBeNull();
    expect(opener?.headline ?? '').not.toContain('being prepared');
    const [fixture] = await pipe.sql<{ game_id: string }[]>`
      select game_id from public.season_schedule
       where save_id = ${saveId} and week = 1 and competition = 'REGULAR'
         and (home_team_id = ${out.userTeamId} or away_team_id = ${out.userTeamId})`;
    expect(opener?.gameId).toBe(fixture?.game_id);
  });

  it('keeps a story read across a re-read', async () => {
    const before = await feed();
    const first = before.items[0];
    expect(first).toBeDefined();
    const marked = await pipe.api.call<MarkNewsReadOut>(
      'mark-news-read', { saveId, newsId: first?.newsId });
    expect(marked.marked).toBe(1);
    expect(marked.unread).toBe(before.unread - 1);

    const after = await feed();
    expect(after.items.find((i) => i.newsId === first?.newsId)?.readAt).not.toBeNull();
    expect(after.unread).toBe(before.unread - 1);
  });

  it('does not re-mark a story that is already read', async () => {
    const out = await feed();
    const read = out.items.find((i) => i.readAt !== null);
    expect(read).toBeDefined();
    const again = await pipe.api.call<MarkNewsReadOut>(
      'mark-news-read', { saveId, newsId: read?.newsId });
    // Zero rows touched, and the time it was first read is left where it is.
    expect(again.marked).toBe(0);
    const after = await feed();
    expect(after.items.find((i) => i.newsId === read?.newsId)?.readAt).toBe(read?.readAt);
  });

  it('refuses a newsId that is not one', async () => {
    await expect(pipe.api.call('mark-news-read', { saveId, newsId: 'lots' }))
      .rejects.toThrow(/positive integer/);
  });

  it('adds a result story about the club when a week is played', async () => {
    const before = await feed();
    const week = await pipe.api.call<WeekOutcome>('sim-week', { saveId });
    expect(week.played).toBeGreaterThan(0);

    const after = await feed();
    expect(after.items.length).toBeGreaterThan(before.items.length);
    const results = after.items.filter((i) => i.category === 'RESULT');
    expect(results).toHaveLength(1);
    const result = results[0];
    // The score is in the headline and the record is in the body, both from
    // the game that was just played rather than from a tally kept alongside.
    expect(result?.headline ?? '').toMatch(/\d+-\d+/);
    const [standing] = await pipe.sql<{ wins: number; losses: number; ties: number }[]>`
      select wins, losses, ties from public.standings
       where save_id = ${saveId} and team_id = ${after.userTeamId}
         and season = ${after.season}`;
    const record = standing === undefined
      ? '' : `${String(standing.wins)}-${String(standing.losses)}`;
    expect(result?.body ?? '').toContain(record);
    // And it hangs off the game, so the story can open the box score.
    expect(result?.gameId).not.toBeNull();
  }, 300_000);

  it('splits the feed into team and league stories with nothing lost', async () => {
    const out = await feed();
    const team = out.items.filter((i) => matchesChip('TEAM', i, out.userTeamId));
    const league = out.items.filter((i) => matchesChip('LEAGUE', i, out.userTeamId));
    // The two are a partition of the feed: every story is one or the other,
    // and none is both. The other chips overlap on purpose; these two do not.
    expect(team.length + league.length).toBe(out.items.length);
    expect(team.some((i) => league.includes(i))).toBe(false);
    expect(team.length).toBeGreaterThan(0);
  });

  it('will not show another user the feed', async () => {
    const other = await openPipe('77777777-0000-0000-0000-0000000000ff');
    try {
      await expect(other.api.call('news', { saveId })).rejects.toThrow();
      await expect(other.api.call('mark-news-read', { saveId, newsId: 1 })).rejects.toThrow();
    } finally {
      await other.close();
    }
  }, 60_000);
});
