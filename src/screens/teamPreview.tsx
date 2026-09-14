// The club, before you take it.
//
// One screen between the board and a decision you live with for a decade, so
// it says what a scouting report would say: how good the roster is by unit,
// what it costs, how old it is, who plays quarterback, what the club owns in
// future drafts, and who you would be working for.
//
// Every figure is measured on the server from the template world's own rows. A
// figure that did not load is an em dash: a club with no cap sheet and a club
// with no cap space are opposite facts, and the screen must not turn the first
// into the second.

import { COLOR, ELEV, FONT, R, S, TYPE, colourWash, tint } from '../app/tokens';
import { ActionButton } from '../components/ActionButton';
import { SectionHeader } from '../components/Surface';
import { StatTiles } from '../components/StatTiles';
import { TeamMark } from '../components/TeamMark';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';

/** Cap money, in the units a cap is talked about. */
export function capIn(dollars: number | null): string | null {
  if (dollars === null) return null;
  const m = dollars / 1_000_000;
  return `${m < 0 ? '-' : ''}$${Math.abs(m).toFixed(1)}M`;
}

/** A rating as a figure, or the dash that says it is not known. */
const rate = (n: number | null): string | null => (n === null ? null : String(n));

function Fact({ label, value, absent = 'Not recorded' }: {
  readonly label: string;
  readonly value: string | null;
  /** What a null says. "Not recorded" means this club's row is missing;
   *  "Not modelled yet" means the world has no such fact about any club. Two
   *  different absences, and a screen that conflates them is lying about one. */
  readonly absent?: string;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: S[3], minWidth: 0,
        padding: `${String(S[2])}px 0`,
        borderBottom: `1px solid ${COLOR.line}`,
      }}
    >
      <span style={{ ...TYPE.micro, color: COLOR.mut, flexShrink: 0 }}>{label}</span>
      <span
        className="numeric"
        style={{
          ...TYPE.body, color: value === null ? COLOR.dim : COLOR.tx,
          minWidth: 0, textAlign: 'right',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {value ?? absent}
      </span>
    </div>
  );
}

export function TeamPreview({ team, onConfirm, onBack, busy = null }: {
  readonly team: TeamProfile;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
  readonly busy?: string | null;
}) {
  return (
    <>
      <section
        style={{
          background: COLOR.panel, borderRadius: R.lg, boxShadow: ELEV.mid,
          border: `1px solid ${COLOR.line}`,
          padding: S[4], marginTop: S[1], minWidth: 0,
          backgroundImage: colourWash(team.primary, team.secondary),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: S[3], minWidth: 0 }}>
          <TeamMark
            abbreviation={team.abbreviation}
            primary={team.primary}
            secondary={team.secondary}
            size={52}
          />
          <div style={{ minWidth: 0 }}>
            <p style={{ ...TYPE.micro, margin: 0, color: COLOR.mut, fontSize: 10.5 }}>
              {team.city}
            </p>
            <h2
              style={{
                margin: '1px 0 0', fontFamily: FONT.display, fontSize: 24, fontWeight: 700,
                letterSpacing: '0.01em', color: COLOR.tx,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {team.teamName}
            </h2>
            <p style={{ ...TYPE.prose, margin: '2px 0 0', color: COLOR.mut, fontSize: 11.5 }}>
              {team.conferenceName} · {team.divisionShort}
            </p>
          </div>
        </div>

        {(team.difficulty !== null || team.archetype !== null) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2], marginTop: S[3] }}>
            {team.difficulty !== null && (
              <span
                data-testid="preview-difficulty"
                style={{
                  ...TYPE.micro, fontSize: 10, color: COLOR.amber,
                  background: tint(COLOR.amber, 0.12),
                  border: `1px solid ${tint(COLOR.amber, 0.45)}`,
                  borderRadius: R.pill, padding: '3px 9px',
                }}
              >
                {team.difficulty}
              </span>
            )}
            {team.archetype !== null && (
              <span
                style={{
                  ...TYPE.micro, fontSize: 10, color: COLOR.mut,
                  background: 'rgba(0,0,0,0.2)',
                  border: `1px solid ${COLOR.line2}`,
                  borderRadius: R.pill, padding: '3px 9px',
                }}
              >
                {team.archetype}
              </span>
            )}
          </div>
        )}
      </section>

      <SectionHeader title="Roster" />
      <StatTiles
        stats={[
          { label: 'Overall', value: rate(team.overall), tone: 'accent' },
          { label: 'Offence', value: rate(team.offense) },
          { label: 'Defence', value: rate(team.defense) },
        ]}
      />
      <div style={{ marginTop: S[3] }}>
        <StatTiles
          stats={[
            { label: 'Special teams', value: rate(team.specialTeams) },
            {
              label: 'Average age',
              value: team.averageAge === null ? null : team.averageAge.toFixed(1),
            },
            {
              label: 'Cap space',
              value: capIn(team.capSpace),
              ...(team.capSpace === null ? {} : {
                tone: team.capSpace < 0 ? 'negative' as const : 'positive' as const,
              }),
            },
          ]}
        />
      </div>

      <SectionHeader title="Front office" />
      <div style={{ minWidth: 0 }}>
        <Fact label="Quarterback" value={team.quarterbackStatus} />
        <Fact
          label="Draft capital"
          value={team.draftCapital === null ? null : String(team.draftCapital)}
        />
        <Fact
          label="Owner patience"
          value={team.ownerPatience === null ? null : `${String(team.ownerPatience)} / 100`}
        />
        <Fact
          label="Stadium"
          value={team.stadiumCapacity === null
            ? null
            : `${team.stadiumCapacity.toLocaleString('en-US')} seats`}
        />
        {/* Reported rather than left off: the row is here because the screen
            promises it, and "not modelled" is the honest value for a crowd the
            world does not simulate yet. */}
        <Fact
          label="Fan pressure"
          value={team.fanPressure === null ? null : String(team.fanPressure)}
          absent="Not modelled yet"
        />
      </div>

      <div style={{ display: 'grid', gap: S[2], marginTop: S[6] }}>
        <ActionButton onClick={onConfirm} disabled={busy !== null} testId="confirm-team">
          {busy ?? `Start with the ${team.teamName}`}
        </ActionButton>
        <ActionButton tone="quiet" onClick={onBack} disabled={busy !== null} testId="back-to-board">
          Choose a different team
        </ActionButton>
      </div>
    </>
  );
}
