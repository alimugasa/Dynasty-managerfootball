// Holds the game and hands it to the screens.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  advanceToNextSeason, reorderDepth, simToEndOfSeason, simWeek,
} from './actions';
import { WEEKS, newGame, type GameState, type PositionGroup } from './store';
import { clearSaved, loadSaved, persist } from './persist';

export interface GameApi {
  readonly state: GameState;
  readonly busy: boolean;
  /** Set when the last action could not play a fixture. */
  readonly notice: string | null;
  simWeek: () => void;
  simSeason: () => void;
  nextSeason: () => void;
  moveInDepth: (group: PositionGroup, playerId: string, direction: -1 | 1) => void;
  restart: (teamId?: string) => void;
}

const GameContext = createContext<GameApi | null>(null);

export function useGame(): GameApi {
  const api = useContext(GameContext);
  if (api === null) throw new Error('useGame must be used inside <GameProvider>');
  return api;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(() => loadSaved() ?? newGame());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const commit = useCallback((next: GameState, abandoned: readonly string[]) => {
    setState(next);
    persist(next);
    setNotice(abandoned.length === 0
      ? null
      : `${String(abandoned.length)} game(s) could not be played: ${abandoned.join(', ')}`);
  }, []);

  const api = useMemo<GameApi>(() => ({
    state,
    busy,
    notice,
    simWeek: () => {
      setBusy(true);
      const outcome = simWeek(state);
      commit(outcome.state, outcome.abandoned);
      setBusy(false);
    },
    simSeason: () => {
      setBusy(true);
      const outcome = simToEndOfSeason(state);
      commit(outcome.state, outcome.abandoned);
      setBusy(false);
    },
    nextSeason: () => {
      setBusy(true);
      const next = advanceToNextSeason(state);
      commit(next, []);
      setBusy(false);
    },
    moveInDepth: (group, playerId, direction) => {
      const next = reorderDepth(state, group, playerId, direction);
      setState(next);
      persist(next);
    },
    restart: (teamId) => {
      clearSaved();
      const fresh = newGame(teamId === undefined ? {} : { userTeamId: teamId });
      setState(fresh);
      persist(fresh);
      setNotice(null);
    },
  }), [state, busy, notice, commit]);

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}

export { WEEKS };
