// Confirm Franchise: everything the flow gathered, and the one button that
// writes it.
//
// Six screens asked six questions and none of them wrote anything. This is the
// single call to create-save, which is one transaction on the server: it clones
// the template world, builds the engine's state from the clone and projects it
// back, and either all of that happened or none of it did. There is no state
// this screen can leave behind half made.
//
// The one field on it is the save file's name, which defaults to the club's.
// Cleared, the button closes: a file called nothing is one the player cannot
// pick out of three on the way back in.
//
// Shared with the play-test rig, like the rest of the boot flow.

import { COLOR, R, S, TYPE, tint } from '../app/tokens';
import { ActionButton } from '../components/ActionButton';
import { SkeletonLine } from '../components/Skeleton';
import { Card, LeagueCard, Row, RulesCard, TeamCard } from './confirmCards';
import { NameField } from './nameField';
import { optionLabel } from './settingsCatalogue';
import { MAX_SAVE_NAME } from '../../supabase/functions/_shared/api/renameSave';
import type {
  Difficulty, FranchiseSettings,
} from '../../supabase/functions/_shared/api/franchiseOptions';
import type { LeagueShape } from '../../supabase/functions/_shared/api/reads/teamBoard';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';

/** What a save file is called when the player has not renamed it. Built from
 *  the club, because that is what they will be looking for in a list of three
 *  a fortnight from now. Null where the club could not be read -- there is no
 *  honest default then, and the field says so by being empty. */
export function defaultSaveName(team: TeamProfile | null): string | null {
  if (team === null) return null;
  const name = `${team.fullName} Franchise`;
  return name.length <= MAX_SAVE_NAME ? name : `${team.teamName} Franchise`;
}

/** What create-save will be given: the typed name, or the club's. */
export function saveNameOf(typed: string | null, team: TeamProfile | null): string {
  return typed ?? defaultSaveName(team) ?? '';
}

/** The state between pressing the button and the league existing.
 *
 *  Each line is something create-save actually does, in the order it does it,
 *  because a progress list that invents steps is a spinner with extra words. */
function BuildingTheLeague() {
  const steps = [
    'Cloning the league',
    'Building rosters and contracts',
    'Writing the cap sheet and the schedule',
    'Opening the franchise',
  ];
  return (
    <div
      data-testid="building"
      aria-busy="true"
      aria-live="polite"
      style={{
        marginTop: S[4], padding: S[5], borderRadius: R.lg,
        background: COLOR.panel, border: `1px solid ${tint(COLOR.amber, 0.35)}`,
        display: 'grid', gap: S[3], minWidth: 0,
      }}
    >
      <p style={{ ...TYPE.heading, margin: 0, fontSize: 15, color: COLOR.amber }}>
        Building the league
      </p>
      <p style={{ ...TYPE.prose, margin: 0, color: COLOR.mut }}>
        Thirty-two rosters, their contracts and a season of fixtures. This takes a few
        seconds and finishes on its own.
      </p>
      <div style={{ display: 'grid', gap: S[2] }}>
        {steps.map((step) => (
          <div key={step} style={{ display: 'flex', alignItems: 'center', gap: S[2], minWidth: 0 }}>
            <SkeletonLine width={10} height={10} radius={999} />
            <span style={{ ...TYPE.prose, color: COLOR.mut, fontSize: 12, minWidth: 0 }}>
              {step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FranchiseSummary({
  slot, gmName, styleLabel, team, settings, difficulty, league = null, season = null,
  saveName, onSaveName, busy = null, failed = false, onCreate, onBack, onChangeTeam,
}: {
  readonly slot: number;
  readonly gmName: string;
  readonly styleLabel: string | null;
  /** Null where the board could not be read. The review still shows the file
   *  and the GM, because those came from the player rather than the server. */
  readonly team: TeamProfile | null;
  readonly settings: FranchiseSettings;
  readonly difficulty: Difficulty;
  readonly league?: LeagueShape | null;
  readonly season?: number | null;
  /** What the player typed, or null for the club's own name. */
  readonly saveName: string | null;
  readonly onSaveName: (next: string) => void;
  readonly busy?: string | null;
  /** True once a creation attempt has come back with an error, so the screen
   *  can stop showing the building state without pretending it succeeded. */
  readonly failed?: boolean;
  readonly onCreate: () => void;
  readonly onBack: () => void;
  readonly onChangeTeam: () => void;
}) {
  const creating = busy !== null;
  const name = saveNameOf(saveName, team);
  const blank = name.trim() === '';
  const tooLong = name.length > MAX_SAVE_NAME;
  const nameError = blank
    ? 'A save file needs a name.'
    : tooLong
      ? `At most ${String(MAX_SAVE_NAME)} characters.`
      : null;

  return (
    <>
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[4])}px`, color: COLOR.mut }}>
        Review your setup before taking the office.
      </p>

      <div style={{ display: 'grid', gap: S[3], minWidth: 0 }}>
        <Card title="Save File and GM" testId="card-gm">
          <NameField
            label="Save name"
            value={name}
            onChange={onSaveName}
            testId="save-name"
            error={nameError}
          />
          <div style={{ marginTop: S[3], minWidth: 0 }}>
            <Row label="Save file" value={`File ${String(slot)}`} />
            <Row label="General manager" value={gmName} />
            <Row label="GM style" value={styleLabel} />
            {/* True of a manager who has not worked a day. Nobody in this
                league has an opinion of a man they have not met. */}
            <Row label="Starting reputation" value="Unknown" />
            <Row label="Career record" value="0-0" />
          </div>
        </Card>

        <TeamCard team={team} onChange={onChangeTeam} disabled={creating} />

        <LeagueCard
          league={league}
          salaryCap={optionLabel('salaryCap', settings.salaryCap)}
        />

        <RulesCard settings={settings} difficulty={difficulty} />
      </div>

      {creating && <BuildingTheLeague />}

      {/* Said where the button is, because that is where the player is looking
          when it comes back. The transaction rolls back whole, so there is
          nothing to clean up before trying again. */}
      {failed && !creating && (
        <p
          data-testid="create-failed"
          style={{
            ...TYPE.prose, margin: `${String(S[4])}px 0 0`,
            padding: `${String(S[2])}px ${String(S[3])}px`,
            borderRadius: R.sm, color: COLOR.tx,
            background: tint(COLOR.red, 0.12),
            border: `1px solid ${tint(COLOR.red, 0.5)}`,
          }}
        >
          The franchise was not created, and file {slot} is still empty. Nothing was
          half written — try again, or go back and change something first.
        </p>
      )}

      <div style={{ display: 'grid', gap: S[2], marginTop: S[6] }}>
        <ActionButton
          onClick={onCreate}
          disabled={creating || nameError !== null}
          testId="create-franchise"
        >
          {busy ?? 'Create Franchise'}
        </ActionButton>
        <ActionButton
          tone="quiet"
          onClick={onBack}
          disabled={creating}
          testId="back-to-preview"
        >
          Back
        </ActionButton>
      </div>

      {season !== null && !creating && (
        <p style={{ ...TYPE.prose, margin: `${String(S[3])}px 2px 0`, color: COLOR.dim, fontSize: 11.5 }}>
          Creating writes the franchise into file {slot} and opens it at week 1 of {season}.
        </p>
      )}
    </>
  );
}
