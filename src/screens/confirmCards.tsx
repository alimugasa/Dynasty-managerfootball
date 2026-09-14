// The four cards a franchise is reviewed on, before it exists.
//
// One card per decision the flow asked for, in the order it asked: who you are,
// who you took, what you are joining, and what rules you set. A player who
// reads all four and presses the button has seen every answer they gave; that
// is the whole job of a confirmation screen, and the reason this one is a stack
// of cards rather than a list of rows.
//
// Everything on them is either what the player entered or what the server
// measured. The league card in particular is counted, not stated: thirty-two
// clubs and eighteen weeks are facts about the template world, and printing
// them as constants would make this screen wrong the day a different seed
// ships.

import type { ReactNode } from 'react';
import { COLOR, ELEV, FONT, R, S, TYPE, tint } from '../app/tokens';
import { TeamMark } from '../components/TeamMark';
import { CommissionerBadge } from './franchiseSettings';
import { SETTINGS, difficultyLabel, optionLabel } from './settingsCatalogue';
import { capIn, draftIn } from './teamPreview';
import type {
  Difficulty, FranchiseSettings,
} from '../../supabase/functions/_shared/api/franchiseOptions';
import type { LeagueShape } from '../../supabase/functions/_shared/api/reads/teamBoard';
import { divisionShort } from '../../supabase/functions/_shared/api/leaguePlacing';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';

export function Card({ title, action, children, testId }: {
  readonly title: string;
  /** The one control that belongs to this card, if any. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly testId: string;
}) {
  return (
    <section
      data-testid={testId}
      style={{
        background: COLOR.panel,
        border: `1px solid ${COLOR.line}`,
        borderRadius: R.lg,
        boxShadow: ELEV.low,
        padding: S[4],
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: S[2],
          marginBottom: S[3], minWidth: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 3, height: 12, flexShrink: 0, borderRadius: 2,
            background: COLOR.amber, boxShadow: `0 0 10px ${COLOR.amber}55`,
          }}
        />
        <h2 style={{ ...TYPE.heading, margin: 0, flex: 1, minWidth: 0, color: COLOR.tx }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, value, tone = 'default' }: {
  readonly label: string;
  readonly value: string | null;
  readonly tone?: 'default' | 'muted';
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        // Wrapping, because a value longer than half a 320px row is a real case
        // here. Ellipsised, the reader loses the end of it.
        flexWrap: 'wrap', gap: `0 ${String(S[3])}px`, minWidth: 0,
        padding: `${String(S[2])}px 0`,
        borderBottom: `1px solid ${COLOR.line}`,
      }}
    >
      <span style={{ ...TYPE.micro, color: COLOR.mut, flexShrink: 0 }}>{label}</span>
      <span
        className="numeric"
        style={{
          ...TYPE.body,
          color: value === null ? COLOR.dim : tone === 'muted' ? COLOR.mut : COLOR.tx,
          flex: '1 1 auto', minWidth: 0, textAlign: 'right',
        }}
      >
        {value ?? 'Not recorded'}
      </span>
    </div>
  );
}

/** A quiet link inside a card header. Not an ActionButton: this is a way out of
 *  the screen, and it must not compete with the one gold button below. */
export function CardLink({ label, onClick, disabled, testId }: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled: boolean;
  readonly testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{
        flexShrink: 0, background: 'none', border: 0, padding: `2px ${String(S[1])}px`,
        color: disabled ? COLOR.dim : COLOR.amber,
        fontFamily: FONT.display, fontSize: 11, fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        cursor: disabled ? 'default' : 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  );
}

export function TeamCard({ team, onChange, disabled }: {
  readonly team: TeamProfile | null;
  readonly onChange: () => void;
  readonly disabled: boolean;
}) {
  return (
    <Card
      title="Team Selection"
      testId="card-team"
      action={(
        <CardLink label="Change Team" onClick={onChange} disabled={disabled} testId="change-team" />
      )}
    >
      {team === null ? (
        <p style={{ ...TYPE.prose, margin: 0, color: COLOR.dim }}>
          The club could not be read. Go back and pick one again.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[3], minWidth: 0 }}>
            <TeamMark
              abbreviation={team.abbreviation}
              primary={team.primary}
              secondary={team.secondary}
              size={44}
            />
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0, fontFamily: FONT.display, fontSize: 20, fontWeight: 600,
                  color: COLOR.tx,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {team.teamName}
              </p>
              <p style={{ ...TYPE.prose, margin: '2px 0 0', color: COLOR.mut, fontSize: 12 }}>
                {team.city} · {divisionShort(team)}
              </p>
            </div>
          </div>
          <div style={{ marginTop: S[3], minWidth: 0 }}>
            <Row label="Difficulty" value={team.difficulty} />
            <Row label="Archetype" value={team.archetype} />
            <Row label="Overall" value={team.overall === null ? null : String(team.overall)} />
            <Row label="Offence" value={team.offense === null ? null : String(team.offense)} />
            <Row label="Defence" value={team.defense === null ? null : String(team.defense)} />
            <Row
              label="Special teams"
              value={team.specialTeams === null ? null : String(team.specialTeams)}
            />
            <Row label="Cap space" value={capIn(team.capSpace)} />
            <Row label="Draft capital" value={draftIn(team.draftLabel, team.draftScore)} />
            <Row
              label="Owner patience"
              value={team.ownerMood === null || team.ownerPatience === null
                ? null
                : `${team.ownerMood} · ${String(team.ownerPatience)}`}
            />
            <Row label="Fan pressure" value={team.fanPressure} />
          </div>
        </>
      )}
    </Card>
  );
}

export function LeagueCard({ league, salaryCap }: {
  readonly league: LeagueShape | null;
  /** The player's own cap setting, shown here because it is a fact about the
   *  competition they are joining as much as a rule they chose. */
  readonly salaryCap: string | null;
}) {
  const count = (n: number | undefined, one: string, many: string): string | null =>
    (n === undefined ? null : `${String(n)} ${n === 1 ? one : many}`);
  return (
    <Card title="League Setup" testId="card-league">
      <div style={{ minWidth: 0 }}>
        <Row label="Teams" value={count(league?.teams, 'team', 'teams')} />
        <Row label="Conferences" value={count(league?.conferences, 'conference', 'conferences')} />
        <Row label="Divisions" value={count(league?.divisions, 'division', 'divisions')} />
        <Row
          label="Regular season"
          value={league?.regularSeasonWeeks == null
            ? null
            : `${String(league.regularSeasonWeeks)}-week regular season`}
        />
        <Row label="Playoffs" value="Enabled" />
        <Row
          label="Draft picks"
          value={league === null ? null : `${String(league.draftPicks)} loaded`}
        />
        <Row label="Salary cap" value={salaryCap} />
        <Row
          label="Starting point"
          value={league === null ? 'Week 1' : `${String(league.season)}, Week 1`}
        />
      </div>
    </Card>
  );
}

export function RulesCard({ settings, difficulty }: {
  readonly settings: FranchiseSettings;
  readonly difficulty: Difficulty;
}) {
  const commissioner = settings.commissionerMode === 'ON';
  return (
    <Card title="Rules and Settings" testId="card-rules">
      <div style={{ minWidth: 0 }}>
        <Row label="Difficulty" value={difficultyLabel(difficulty)} />
        {SETTINGS.map((def) => (
          <Row
            key={def.key}
            label={def.title}
            // A value this build cannot name is reported as unknown rather than
            // printed as its raw key.
            value={optionLabel(def.key, settings[def.key])}
          />
        ))}
      </div>
      <div
        data-testid="rules-verdict"
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: S[2],
          marginTop: S[3], padding: `${String(S[2])}px ${String(S[3])}px`,
          borderRadius: R.sm,
          background: commissioner ? tint(COLOR.amber, 0.1) : 'rgba(0,0,0,0.18)',
          border: `1px solid ${commissioner ? tint(COLOR.amber, 0.45) : COLOR.line}`,
        }}
      >
        {commissioner
          ? (
            <>
              <CommissionerBadge />
              <span style={{ ...TYPE.prose, color: COLOR.amber, fontSize: 12, minWidth: 0 }}>
                This save allows editing tools.
              </span>
            </>
          )
          : (
            <span style={{ ...TYPE.prose, color: COLOR.mut, fontSize: 12 }}>
              Realistic franchise rules.
            </span>
          )}
      </div>
    </Card>
  );
}
