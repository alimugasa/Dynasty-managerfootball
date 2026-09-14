// The franchise being set up, before there is a franchise.
//
// Create GM and Select Team are two questions about one thing, and the thing
// does not exist yet: nothing is written to the server until the last screen in
// the flow creates it. So the answers collect here, above the navigation stack,
// where walking forward and back between the two screens does not lose them and
// where a screen added to the flow later can read what the ones before it
// gathered without every screen having to forward params to the next.
//
// In memory, and deliberately so. A reload with no save open lands on the front
// door -- that is what OpenSaveRouter does -- and a half-answered franchise
// restored behind a screen the player is no longer on would be a worse lie than
// asking the two questions again.
//
// The draft is not a save. It is cleared the moment one is created from it, and
// cleared again whenever the player walks out of the flow.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_GM_STYLE, type GmStyleKey } from '../screens/gmStyles';

/** What has been answered so far. The names start empty and the style starts at
 *  its default, because the player has to be shown something to change. */
export interface FranchiseDraft {
  /** The save file the franchise is being built in. */
  readonly slot: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly style: GmStyleKey;
}

export interface FranchiseSetupApi {
  /** The franchise being set up, or null when none is. */
  readonly draft: FranchiseDraft | null;
  /** Starts a draft in `slot`, or keeps the existing one when it is already
   *  about that slot -- which is what makes Back out of Create GM and into it
   *  again show what was typed rather than an empty form. */
  begin: (slot: number) => void;
  /** Records what a screen in the flow has gathered. */
  record: (answers: Partial<Omit<FranchiseDraft, 'slot'>>) => void;
  /** Throws the draft away: the franchise was created, or abandoned. */
  clear: () => void;
}

const FranchiseSetupContext = createContext<FranchiseSetupApi | null>(null);

export function useFranchiseSetup(): FranchiseSetupApi {
  const value = useContext(FranchiseSetupContext);
  if (value === null) {
    throw new Error('useFranchiseSetup must be used inside <FranchiseSetupProvider>');
  }
  return value;
}

export function FranchiseSetupProvider({ children }: { readonly children: ReactNode }) {
  const [draft, setDraft] = useState<FranchiseDraft | null>(null);

  const begin = useCallback((slot: number) => {
    setDraft((d) => (d !== null && d.slot === slot
      ? d
      : { slot, firstName: '', lastName: '', style: DEFAULT_GM_STYLE }));
  }, []);

  const record = useCallback((answers: Partial<Omit<FranchiseDraft, 'slot'>>) => {
    // A record with no draft under it is a screen running outside the flow it
    // belongs to. Dropping it is right: there is no franchise to record against,
    // and inventing a slot to hang the answer on would put the dynasty in a
    // file the player never picked.
    setDraft((d) => (d === null ? null : { ...d, ...answers }));
  }, []);

  const clear = useCallback(() => { setDraft(null); }, []);

  const value = useMemo<FranchiseSetupApi>(
    () => ({ draft, begin, record, clear }), [draft, begin, record, clear]);

  return (
    <FranchiseSetupContext.Provider value={value}>{children}</FranchiseSetupContext.Provider>
  );
}
