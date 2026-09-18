// The rules this franchise is played under.
//
// The eight settings were chosen before the save existed and have been on the
// saves row ever since; this is the first screen that reads them back. It is
// read-only on purpose. Changing a rule mid-dynasty is a decision about what a
// record means -- a Hard save that spent its last four seasons on Easy is not
// a Hard save -- and until the simulation reads these at all, an editor here
// would be a control that changes nothing but the label on the file.

import { COLOR, S, TYPE } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { EmptyState, SectionHeader } from '../components/Surface';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { RulesCard } from './confirmCards';
import { difficultyLabel } from './settingsCatalogue';
import { Screen } from './Screen';
import { difficultyOf } from '../../supabase/functions/_shared/api/franchiseOptions';

export function FranchiseRulesScreen() {
  const { save, loaded, loadError } = useSave();

  if (loadError !== null) {
    return <Screen title="Franchise rules" screen="rules"><QueryError error={loadError} /></Screen>;
  }
  if (!loaded) {
    return <Screen title="Franchise rules" screen="rules"><Loading label="Loading the rules" /></Screen>;
  }
  if (save === null) return <Screen title="Franchise rules" screen="rules"><NoDynasty /></Screen>;

  const settings = save.settings;

  return (
    <Screen
      title="Franchise rules"
      subtitle={settings === null
        ? save.name
        : `${save.name} · ${difficultyLabel(difficultyOf(settings))}`}
      screen="rules"
    >
      {settings === null ? (
        // A save made before the question was asked. Reported as unrecorded
        // rather than shown as Normal: Normal is an answer, and this save
        // does not have one (ARCHITECTURE.md rule 3).
        <EmptyState
          title="No rules recorded on this save"
          detail="This dynasty was created before the game asked. Nothing is assumed on its
            behalf, so no difficulty is shown."
        />
      ) : (
        <>
          <RulesCard settings={settings} difficulty={difficultyOf(settings)} />

          <SectionHeader title="What these do today" />
          <p style={{ ...TYPE.prose, margin: '0 2px', color: COLOR.dim, fontSize: 12 }}>
            Stored with the save and shown here, and nothing more: the simulation does not
            read them yet. Injuries, trades, development and scouting all run the same way
            on every difficulty. They are kept because a question the save discards is a
            question that should not have been asked, and they will be read as each part
            of the game learns to.
          </p>

          <div style={{ marginTop: S[4] }}>
            <p style={{ ...TYPE.prose, margin: '0 2px', color: COLOR.dim, fontSize: 12 }}>
              The rules are fixed for the life of a dynasty. A record set under one set of
              rules should mean the same thing in ten seasons as it did in the first.
            </p>
          </div>
        </>
      )}
    </Screen>
  );
}
