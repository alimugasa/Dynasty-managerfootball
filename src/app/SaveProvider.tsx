// The dynasty the client is playing, and the buttons that move it.
//
// The client holds no game state. It holds which save it is looking at, the
// clubs' names and colours, and a version counter that every write bumps so
// the screens re-read. Every action is one API call; the server plays the
// week, runs the offseason, or reorders the chart, and the tables it wrote are
// what the screens then read.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../data/client';
import type { Club, SaveOut, SaveSummary } from '../../supabase/functions/_shared/api/reads/save';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { SeasonOutcome } from '../../supabase/functions/_shared/api/rollover';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';

export interface SaveApi {
  /** Null while loading; then the save, or null when the user has none yet. */
  readonly save: SaveSummary | null;
  readonly loaded: boolean;
  readonly loadError: Error | null;
  readonly clubs: readonly Club[];
  readonly clubsById: ReadonlyMap<string, Club>;
  /** Bumped after every write. Screens pass it to useQuery. */
  readonly version: number;
  readonly busy: string | null;
  /** The last action's complaint, or what the server refused. */
  readonly notice: string | null;
  simWeek: () => Promise<void>;
  simSeason: () => Promise<void>;
  nextSeason: () => Promise<void>;
  setDepthChart: (group: string, order: readonly string[]) => Promise<void>;
  startDynasty: (teamId: string, name: string) => Promise<void>;
  /** Deletes the current save and starts over on the given club. */
  restart: (teamId: string) => Promise<void>;
}

const SaveContext = createContext<SaveApi | null>(null);

export function useSave(): SaveApi {
  const value = useContext(SaveContext);
  if (value === null) throw new Error('useSave must be used inside <SaveProvider>');
  return value;
}

export function SaveProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<SaveOut | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setCurrent(await api().call<SaveOut>('save'));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error : new Error(String(error)));
    }
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const clubsById = useMemo(
    () => new Map((current?.clubs ?? []).map((c) => [c.id, c])), [current]);

  /** Runs one write, then re-reads the save so week and phase are current. */
  const act = useCallback(async (label: string, run: () => Promise<void>) => {
    setBusy(label);
    setNotice(null);
    try {
      await run();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      await reload();
      setBusy(null);
    }
  }, [reload]);

  const value = useMemo<SaveApi>(() => {
    const save = current?.save ?? null;
    const need = (): string => {
      if (save === null) throw new Error('No dynasty is open');
      return save.saveId;
    };
    return {
      save, loaded: current !== null, loadError,
      clubs: current?.clubs ?? [], clubsById, version, busy, notice,
      simWeek: () => act('Simulating…', async () => {
        const out = await api().call<WeekOutcome>('sim-week', { saveId: need() });
        if (out.abandoned.length > 0) {
          setNotice(`${String(out.abandoned.length)} game(s) could not be played: ${out.abandoned.join(', ')}`);
        }
      }),
      simSeason: () => act('Simulating season…', async () => {
        const saveId = need();
        const abandoned: string[] = [];
        let phase = save?.phase ?? '';
        let guard = 0;
        while (phase === 'REGULAR_SEASON' && guard < 30) {
          guard += 1;
          const out = await api().call<WeekOutcome>('sim-week', { saveId });
          abandoned.push(...out.abandoned);
          phase = out.phase;
        }
        if (abandoned.length > 0) {
          setNotice(`${String(abandoned.length)} game(s) could not be played: ${abandoned.join(', ')}`);
        }
      }),
      nextSeason: () => act('Running offseason…', async () => {
        const out = await api().call<SeasonOutcome>('advance-season', { saveId: need() });
        // The one offseason outcome a manager must not miss.
        if (out.newHeadCoach) {
          setNotice('Your club has a new head coach. See Office → Coaching staff.');
        }
      }),
      setDepthChart: (group, order) => act('Saving…', async () => {
        await api().call('set-depth-chart', { saveId: need(), group, order });
      }),
      startDynasty: (teamId, name) => act('Creating…', async () => {
        await api().call<CreateSaveOut>('create-save', { name, teamId });
      }),
      restart: (teamId) => act('Starting over…', async () => {
        if (save !== null) await api().call('delete-save', { saveId: save.saveId });
        const club = clubsById.get(teamId);
        await api().call<CreateSaveOut>('create-save', {
          name: club === undefined ? 'New dynasty' : `${club.name} dynasty`, teamId,
        });
      }),
    };
  }, [current, loadError, clubsById, version, busy, notice, act]);

  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}
