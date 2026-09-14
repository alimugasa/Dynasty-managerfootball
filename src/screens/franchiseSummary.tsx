// Everything the flow gathered, and the button that commits it.
//
// Four screens asked four questions and none of them wrote anything. This is
// where the answers are read back in one place and turned into a dynasty.
//
// It is called Settings because that is what it will be. Today it holds none:
// every setting this game could offer -- a difficulty, a season length, a
// simulation speed -- would be a control with nothing behind it, and the rule
// about not inventing data applies just as squarely to inventing a knob. What
// it holds instead is the review a player should get before a decade-long
// decision, and an honest account of what the next tap does.
//
// Shared with the play-test rig, like the rest of the boot flow.

import { COLOR, FONT, R, S, TYPE, tint } from '../app/tokens';
import { ActionButton } from '../components/ActionButton';
import { SectionHeader } from '../components/Surface';
import { TeamMark } from '../components/TeamMark';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';

function Row({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        // Wrapping, because a value longer than half a 320px row is a real
        // case on this screen -- "Zaire Prewitt · WR, 23 · 84" needs 188px and
        // has 149. Ellipsised, the reader loses the rating; wrapped, the value
        // drops under its own label and keeps every character.
        flexWrap: 'wrap', gap: `0 ${String(S[3])}px`, minWidth: 0,
        padding: `${String(S[2])}px 0`,
        borderBottom: `1px solid ${COLOR.line}`,
      }}
    >
      <span style={{ ...TYPE.micro, color: COLOR.mut, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          ...TYPE.body, color: value === null ? COLOR.dim : COLOR.tx,
          flex: '1 1 auto', minWidth: 0, textAlign: 'right',
        }}
      >
        {value ?? 'Not chosen'}
      </span>
    </div>
  );
}

export function FranchiseSummary({
  slot, gmName, styleLabel, team, busy = null, onCreate, onBack,
}: {
  readonly slot: number;
  readonly gmName: string;
  readonly styleLabel: string | null;
  /** Null where the board could not be read. The review still shows the file
   *  and the GM, because those came from the player rather than the server. */
  readonly team: TeamProfile | null;
  readonly busy?: string | null;
  readonly onCreate: () => void;
  readonly onBack: () => void;
}) {
  return (
    <>
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[4])}px`, color: COLOR.mut }}>
        Everything is set. Nothing has been written yet — creating the franchise is what
        puts it in file {slot}.
      </p>

      {team !== null && (
        <div
          data-testid="settings-team"
          style={{
            display: 'flex', alignItems: 'center', gap: S[3],
            padding: S[4], borderRadius: R.lg,
            background: COLOR.raise,
            border: `1px solid ${tint(team.primary, 0.5)}`,
            minWidth: 0,
          }}
        >
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
              {team.fullName}
            </p>
            <p style={{ ...TYPE.prose, margin: '2px 0 0', color: COLOR.mut, fontSize: 11.5 }}>
              {team.conferenceName} · {team.divisionShort}
              {team.difficulty === null ? '' : ` · ${team.difficulty}`}
            </p>
          </div>
        </div>
      )}

      <SectionHeader title="Your franchise" />
      <div data-testid="settings-review" style={{ minWidth: 0 }}>
        <Row label="Save file" value={`File ${String(slot)}`} />
        <Row label="General manager" value={gmName} />
        <Row label="GM style" value={styleLabel} />
        <Row label="Team" value={team?.fullName ?? null} />
      </div>

      <SectionHeader title="How it starts" />
      {/* Facts about create-save, not promises: every one of these is
          something the handler does on the next tap. */}
      <div style={{ minWidth: 0 }}>
        <Row label="Season" value="Opens at week 1" />
        <Row label="League" value="Thirty-two clubs, full rosters" />
        <Row label="Seed" value="Generated on the server" />
      </div>

      <div style={{ display: 'grid', gap: S[2], marginTop: S[6] }}>
        <ActionButton onClick={onCreate} disabled={busy !== null} testId="create-franchise">
          {busy ?? 'Create Franchise'}
        </ActionButton>
        <ActionButton
          tone="quiet"
          onClick={onBack}
          disabled={busy !== null}
          testId="back-to-preview"
        >
          Back
        </ActionButton>
      </div>
    </>
  );
}
