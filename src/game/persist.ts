// Keeping the dynasty between page loads.
//
// The save system in supabase/functions/_shared/save owns the format and its
// versioning; this adds the browser's storage and the parts of a session that
// are not league state -- the schedule, the standings, the week, the results
// already played. Those are not in the save document because the document
// describes a league, not a session in progress.
//
// localStorage, because there is no server write path yet. A season of box
// scores is a few hundred kilobytes, which fits; when it does not, the write
// fails and the game keeps running unsaved rather than dying.

import {
  deserialize, migrate, serialize, SAVE_SCHEMA_VERSION,
} from '../../supabase/functions/_shared/save/index';
import type { UnknownDocument } from '../../supabase/functions/_shared/save/index';
import { loadIdentities, type GameState, type PlayedGame, type SeasonHistory, type Standing }
  from './store';
import type { Fixture } from '../../supabase/functions/_shared/engine/season';
import type { NewsItem } from '../../supabase/functions/_shared/engine/news/index';
import type { PositionGroup } from '../../supabase/functions/_shared/engine/types';

const KEY = 'dmp.save.v1';

interface StoredSession {
  readonly document: unknown;
  readonly userTeamId: string;
  readonly week: number;
  readonly phase: GameState['phase'];
  readonly schedule: readonly Fixture[];
  readonly results: readonly PlayedGame[];
  readonly standings: readonly Standing[];
  readonly news: readonly NewsItem[];
  readonly history: readonly SeasonHistory[];
  readonly depthChart: Readonly<Record<string, readonly string[]>>;
  readonly absence: readonly [string, number][];
  readonly seed: number;
}

export function persist(state: GameState): void {
  try {
    const document = serialize(state.league, {
      meta: {
        saveId: 'local', name: 'Local dynasty', userTeamId: state.userTeamId,
        season: state.season, week: state.week, phase: state.phase,
        seed: state.seed, engineVersion: String(SAVE_SCHEMA_VERSION),
        createdAt: new Date(0).toISOString(), updatedAt: new Date().toISOString(),
      },
    });
    const session: StoredSession = {
      document,
      userTeamId: state.userTeamId,
      week: state.week,
      phase: state.phase,
      schedule: state.schedule,
      results: state.results,
      standings: [...state.standings.values()],
      news: state.news,
      history: state.history,
      depthChart: state.depthChart,
      absence: [...state.absence.entries()],
      seed: state.seed,
    };
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // A quota failure must not take the game down mid-season. The dynasty
    // continues in memory; the player loses it on refresh, which is bad but is
    // recoverable and visible, unlike a crash.
  }
}

export function loadSaved(): GameState | null {
  let session: StoredSession;
  try {
    const text = localStorage.getItem(KEY);
    if (text === null) return null;
    session = JSON.parse(text) as StoredSession;
  } catch {
    return null;
  }

  try {
    const { document } = migrate(session.document as UnknownDocument);
    const { league } = deserialize(document);
    // Built from the save, not from a fresh league. Calling newGame() here
    // rebuilt the whole 2,848-player world from the seed CSVs and then threw it
    // away, which doubled the boot time of every returning dynasty.
    return {
      league,
      identities: loadIdentities(),
      season: league.season,
      userTeamId: session.userTeamId,
      week: session.week,
      phase: session.phase,
      schedule: session.schedule,
      results: session.results,
      standings: new Map(session.standings.map((s) => [s.teamId, s])),
      news: session.news,
      history: session.history,
      depthChart: session.depthChart as Record<PositionGroup, readonly string[]>,
      absence: new Map(session.absence),
      seed: session.seed,
    };
  } catch {
    // A save this build cannot read is dropped rather than crashing the app on
    // boot. Losing a dynasty is bad; a white screen with no way back is worse.
    clearSaved();
    return null;
  }
}

export function clearSaved(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}
