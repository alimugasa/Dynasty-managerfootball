// The dynasty the client is playing, and the buttons that move it.
//
// The client holds no game state. It holds which save it is looking at, the
// clubs' names and colours, and a version counter that every write bumps so
// the screens re-read. Every action is one API call; the server plays the
// week, runs the offseason, or reorders the chart, and the tables it wrote are
// what the screens then read.
//
// Which save is open is a decision, not a guess. Nothing is loaded until the
// menu opens one, and the id is remembered in this browser so a reload puts
// the player back in the game rather than at the front door. It is remembered
// per browser and nowhere else: the save itself lives on the server, and a
// player on another device meets the menu, which is the correct answer.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../data/client';
import type { Club, SaveOut, SaveSummary } from '../../supabase/functions/_shared/api/reads/save';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { SeasonOutcome } from '../../supabase/functions/_shared/api/rollover';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';

export interface SaveApi {
  /** The open save, or null when none is. Meaningful only once `loaded`. */
  readonly save: SaveSummary | null;
  /** The question "which save is open" has been settled -- with an answer of
   *  "none" as often as with a save. Not the same as having one. */
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
  /** Runs the rest of the offseason in one call. */
  nextSeason: () => Promise<void>;
  /** One step of an offseason played through. */
  advanceOffseason: () => Promise<void>;
  /** A move the manager makes himself. The server refuses what it must, and
   *  what it says comes back as the notice. */
  offseasonMove: (route: string, input: Record<string, unknown>) => Promise<void>;
  setDepthChart: (group: string, order: readonly string[]) => Promise<void>;
  /** Creates a dynasty in `slot` under a named GM, and opens it. */
  startDynasty: (input: NewDynasty) => Promise<void>;
  /** Opens an existing save. */
  openSave: (saveId: string) => Promise<void>;
  /** Closes the open save and returns to the menu. Deletes nothing. */
  leaveSave: () => void;
  /** Deletes a save outright. Used from the slot screen, never mid-game. */
  deleteSave: (saveId: string) => Promise<void>;
}

export interface NewDynasty {
  readonly slot: number;
  readonly teamId: string;
  readonly gmFirstName: string;
  readonly gmLastName: string;
}

/** Where this browser remembers the open save. A convenience for this viewer
 *  on this device, so it is the one thing kept in localStorage; every fact
 *  about the save itself is read from the server.
 *
 *  Exported so a test can put the app in the state a player would be in after
 *  opening a save, rather than hardcoding the key and drifting from it. */
export const OPEN_SAVE_KEY = 'dmp.openSaveId';

function rememberedSave(): string | null {
  // Storage throws outright in some contexts (a private window with site data
  // blocked), and a menu that crashes on boot is worse than one that forgets.
  try {
    return window.localStorage.getItem(OPEN_SAVE_KEY);
  } catch {
    return null;
  }
}

function remember(saveId: string | null): void {
  try {
    if (saveId === null) window.localStorage.removeItem(OPEN_SAVE_KEY);
    else window.localStorage.setItem(OPEN_SAVE_KEY, saveId);
  } catch {
    // Not being able to remember costs one trip through the menu next time.
  }
}

const SaveContext = createContext<SaveApi | null>(null);

export function useSave(): SaveApi {
  const value = useContext(SaveContext);
  if (value === null) throw new Error('useSave must be used inside <SaveProvider>');
  return value;
}

export function SaveProvider({ children }: { children: ReactNode }) {
  const [openSaveId, setOpenSaveId] = useState<string | null>(
    () => (typeof window === 'undefined' ? null : rememberedSave()));
  const [current, setCurrent] = useState<SaveOut | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  const reload = useCallback(async (saveId: string | null) => {
    if (saveId === null) {
      setCurrent(null);
      setLoadError(null);
      setSettled(true);
      setVersion((v) => v + 1);
      return;
    }
    try {
      setCurrent(await api().call<SaveOut>('save', { saveId }));
      setLoadError(null);
    } catch (error) {
      // A remembered save that is gone -- deleted from another device, or a
      // database rebuilt under it -- is not an error to sit on. Forget it and
      // show the menu, which is where the player can do something about it.
      setOpenSaveId(null);
      remember(null);
      setCurrent(null);
      setLoadError(error instanceof Error ? error : new Error(String(error)));
    }
    setSettled(true);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => { void reload(openSaveId); }, [reload, openSaveId]);

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
      await reload(openSaveId);
      setBusy(null);
    }
  }, [reload, openSaveId]);

  const value = useMemo<SaveApi>(() => {
    const save = current?.save ?? null;
    const need = (): string => {
      if (save === null) throw new Error('No dynasty is open');
      return save.saveId;
    };
    return {
      save, loaded: settled, loadError,
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
      advanceOffseason: () => act('Working…', async () => {
        const out = await api().call<{ summary: string; waitingOnPick: { round: number; overall: number } | null }>(
          'advance-offseason', { saveId: need() });
        setNotice(out.summary);
      }),
      offseasonMove: (route, input) => act('Working…', async () => {
        const out = await api().call<{ done: boolean; detail: string }>(
          route, { saveId: need(), ...input });
        // Refusals and agreements both come back the same way: the server
        // says what happened, and the screen shows it either way.
        setNotice(out.detail);
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
      startDynasty: (input) => act('Creating…', async () => {
        const out = await api().call<CreateSaveOut>('create-save', {
          // The save's name is not asked for: a dynasty is known by its club
          // and its GM, both of which the player has just chosen.
          name: `${input.gmFirstName} ${input.gmLastName}`.trim(),
          teamId: input.teamId,
          slot: input.slot,
          gmFirstName: input.gmFirstName,
          gmLastName: input.gmLastName,
        });
        setOpenSaveId(out.saveId);
        remember(out.saveId);
      }),
      openSave: (saveId) => act('Opening…', async () => {
        // Read before it is opened, so a save that cannot be read leaves the
        // player on the menu instead of inside a screen with nothing behind it.
        await api().call<SaveOut>('save', { saveId });
        setOpenSaveId(saveId);
        remember(saveId);
      }),
      leaveSave: () => {
        setOpenSaveId(null);
        remember(null);
        setNotice(null);
      },
      deleteSave: (saveId) => act('Deleting…', async () => {
        await api().call('delete-save', { saveId });
        if (saveId === openSaveId) {
          setOpenSaveId(null);
          remember(null);
        }
      }),
    };
  }, [current, loadError, clubsById, version, busy, notice, act, openSaveId, settled]);

  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}
