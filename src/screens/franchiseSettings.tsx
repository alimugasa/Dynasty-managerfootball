// How this franchise will be played.
//
// Three things stacked: a reminder of where you are in the flow, the difficulty
// that sets all eight rules at once, and the eight rules themselves.
//
// The rules are locked under Easy, Normal and Hard, and unlock under Custom.
// Shown-but-locked rather than hidden: a preset is a statement about all eight,
// and a player choosing Hard deserves to see what Hard actually did rather than
// take the word for it.
//
// Shared with the play-test rig, like the rest of the boot flow.

import { COLOR, ELEV, FONT, R, S, TYPE, tint } from '../app/tokens';
import { Segmented } from '../components/Segmented';
import { SectionHeader } from '../components/Surface';
import { TeamMark } from '../components/TeamMark';
import { DIFFICULTY_CARDS, SETTINGS, difficultyLabel } from './settingsCatalogue';
import {
  DIFFICULTIES, PRESETS, difficultyOf,
  type Difficulty, type FranchiseSettings, type SettingKey,
} from '../../supabase/functions/_shared/api/franchiseOptions';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';

/** The badge a franchise with the editing tools open carries, everywhere the
 *  settings are shown. Amber, because amber is this app's "look here". */
export function CommissionerBadge() {
  return (
    <span
      data-testid="commissioner-badge"
      style={{
        ...TYPE.micro, fontSize: 10, color: COLOR.amber,
        background: tint(COLOR.amber, 0.13),
        border: `1px solid ${tint(COLOR.amber, 0.5)}`,
        borderRadius: R.pill, padding: '3px 8px', whiteSpace: 'nowrap',
      }}
    >
      Commissioner Tools Enabled
    </span>
  );
}

/** Where you are in the flow, in one card. */
function SetupSummary({ gmName, team, difficulty, season, commissioner }: {
  readonly gmName: string;
  readonly team: TeamProfile | null;
  readonly difficulty: Difficulty;
  readonly season: number | null;
  readonly commissioner: boolean;
}) {
  return (
    <section
      data-testid="setup-summary"
      style={{
        display: 'grid', gap: S[3],
        background: COLOR.raise,
        border: `1px solid ${team === null ? COLOR.line2 : tint(team.primary, 0.5)}`,
        borderRadius: R.lg, boxShadow: ELEV.low,
        padding: S[4], marginTop: S[1], minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: S[3], minWidth: 0 }}>
        {team !== null && (
          <TeamMark
            abbreviation={team.abbreviation}
            primary={team.primary}
            secondary={team.secondary}
            size={38}
          />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0, fontFamily: FONT.display, fontSize: 17, fontWeight: 600,
              color: COLOR.tx,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {team?.fullName ?? 'No team chosen'}
          </p>
          <p style={{ ...TYPE.prose, margin: '2px 0 0', color: COLOR.mut, fontSize: 12 }}>
            {gmName}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${String(S[1])}px ${String(S[2])}px` }}>
        <span
          data-testid="summary-difficulty"
          style={{
            ...TYPE.micro, fontSize: 10, color: COLOR.tx,
            background: 'rgba(0,0,0,0.24)', border: `1px solid ${COLOR.line2}`,
            borderRadius: R.pill, padding: '3px 8px', whiteSpace: 'nowrap',
          }}
        >
          {difficultyLabel(difficulty)}
        </span>
        <span
          style={{
            ...TYPE.micro, fontSize: 10, color: COLOR.mut,
            background: 'rgba(0,0,0,0.24)', border: `1px solid ${COLOR.line2}`,
            borderRadius: R.pill, padding: '3px 8px', whiteSpace: 'nowrap',
          }}
        >
          {/* Reported, not assumed: the season comes from the template world
              the save is about to be cloned from. */}
          {season === null ? 'Season not read' : `Opens ${String(season)}`}
        </span>
        {commissioner && <CommissionerBadge />}
      </div>
    </section>
  );
}

function SettingRow({ title, detail, options, value, onChange, locked, testId }: {
  readonly title: string;
  readonly detail: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly locked: boolean;
  readonly testId: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        display: 'grid', gap: S[2],
        padding: `${String(S[3])}px 0`,
        borderBottom: `1px solid ${COLOR.line}`,
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ ...TYPE.body, margin: 0, color: COLOR.tx }}>{title}</p>
        <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 0`, color: COLOR.mut, fontSize: 12 }}>
          {detail}
        </p>
      </div>
      <Segmented
        segments={options}
        value={value}
        onChange={onChange}
        label={title}
        disabled={locked}
        testId={`${testId}-control`}
      />
    </div>
  );
}

export function FranchiseSettingsBody({
  gmName, team, season, settings, difficulty, onDifficulty, onSetting,
}: {
  readonly gmName: string;
  readonly team: TeamProfile | null;
  readonly season: number | null;
  readonly settings: FranchiseSettings;
  readonly difficulty: Difficulty;
  readonly onDifficulty: (next: Difficulty) => void;
  readonly onSetting: (key: SettingKey, value: string) => void;
}) {
  const locked = difficulty !== 'CUSTOM';
  const chosen = DIFFICULTY_CARDS.find((d) => d.key === difficulty);

  return (
    <>
      <SetupSummary
        gmName={gmName}
        team={team}
        difficulty={difficulty}
        season={season}
        commissioner={settings.commissionerMode === 'ON'}
      />

      <SectionHeader title="Difficulty" />
      <div
        style={{
          background: COLOR.panel, border: `1px solid ${COLOR.line}`,
          borderRadius: R.md, padding: S[3], minWidth: 0,
        }}
      >
        <Segmented
          segments={DIFFICULTIES.map((key) => ({
            value: key, label: difficultyLabel(key),
          }))}
          value={difficulty}
          onChange={(next) => { onDifficulty(next as Difficulty); }}
          label="Difficulty"
          testId="difficulty"
        />
        {/* One explanation, for the one that is chosen. Four paragraphs stacked
            is a page of reading where a player wanted a decision. */}
        {chosen !== undefined && (
          <p
            data-testid="difficulty-detail"
            style={{ ...TYPE.prose, margin: `${String(S[3])}px 2px 0`, color: COLOR.mut, fontSize: 12 }}
          >
            {chosen.detail}
          </p>
        )}
      </div>

      <SectionHeader title="Rules" />
      <p
        data-testid="rules-note"
        style={{ ...TYPE.prose, margin: `0 2px ${String(S[2])}px`, color: COLOR.dim, fontSize: 12 }}
      >
        {locked
          ? `Set by ${difficultyLabel(difficulty)}. Choose Custom to change them.`
          : 'Set each rule yourself.'}
      </p>

      <div style={{ minWidth: 0 }}>
        {SETTINGS.map((def) => (
          <SettingRow
            key={def.key}
            title={def.title}
            detail={def.detail}
            options={def.options}
            value={settings[def.key]}
            locked={locked}
            testId={`setting-${def.key}`}
            onChange={(next) => { onSetting(def.key, next); }}
          />
        ))}
      </div>

      {/* Said once, plainly, and at the foot rather than on all eight rows:
          the rules are recorded on the save from today, and the simulation
          starts reading them when it is built to. A control that promises
          lighter injuries and delivers none is worse than no control. */}
      <p
        data-testid="rules-honesty"
        style={{ ...TYPE.prose, margin: `${String(S[4])}px 2px 0`, color: COLOR.dim, fontSize: 12 }}
      >
        Saved with the franchise. The simulation does not read these yet.
      </p>
    </>
  );
}

export { PRESETS, difficultyOf };
