// The club you are about to take, before you take it.
//
// A scouting report, in the order a front office would read one: who they are,
// how good they are, what they can spend, and what the football problem is.
// The last line of the report is the first thing this manager should do about
// it, which is the whole point of reading the four sections above it.
//
// Every figure is measured on the server from the template world's own rows,
// and every phrase is a pure function of those figures. A figure that did not
// load is an em dash and a phrase that could not be derived is absent: a club
// with no cap sheet and a club with no cap space are opposite facts, and the
// screen must not turn the first into the second.
//
// Shared with the play-test rig, like the rest of the boot flow.

import { COLOR, R, S, TYPE } from '../app/tokens';
import { ActionButton } from '../components/ActionButton';
import { SectionHeader } from '../components/Surface';
import { SkeletonLine } from '../components/Skeleton';
import { RatingRow, RatingRowSkeleton } from './ratingRing';
import { TeamIdentity, TeamIdentitySkeleton } from './teamIdentity';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';

/** Cap money, in the units a cap is talked about. */
export function capIn(dollars: number | null): string | null {
  if (dollars === null) return null;
  const m = dollars / 1_000_000;
  return `${m < 0 ? '-' : ''}$${Math.abs(m).toFixed(1)}M`;
}

/** "Strong · 82", or nothing at all. Both halves or neither: a score with no
 *  word beside it is a number nobody can place. */
export function draftIn(label: string | null, score: number | null): string | null {
  if (label === null || score === null) return null;
  return `${label} · ${String(score)}`;
}

/** A named player as one line: who, where, and how good. */
export function playerIn(p: TeamProfile['bestPlayer']): string | null {
  if (p === null) return null;
  const age = p.age === undefined ? '' : `, ${String(p.age)}`;
  return `${p.name} · ${p.position}${age} · ${String(p.overall)}`;
}

function Fact({ label, value, absent = 'Not recorded', testId }: {
  readonly label: string;
  readonly value: string | null;
  /** What a null says. "Not recorded" means this club's row is missing;
   *  another phrase is for a fact the world has no version of. Two different
   *  absences, and a screen that conflates them is lying about one. */
  readonly absent?: string;
  readonly testId?: string;
}) {
  return (
    <div
      {...(testId === undefined ? {} : { 'data-testid': testId })}
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
        className="numeric"
        style={{
          ...TYPE.body, color: value === null ? COLOR.dim : COLOR.tx,
          flex: '1 1 auto', minWidth: 0, textAlign: 'right',
        }}
      >
        {value ?? absent}
      </span>
    </div>
  );
}

function FactsSkeleton({ rows }: { readonly rows: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: S[3], padding: `${String(S[2])}px 0`,
            borderBottom: `1px solid ${COLOR.line}`,
          }}
        >
          <SkeletonLine width={`${28 + ((i * 11) % 18)}%`} height={9} />
          <SkeletonLine width={`${30 + ((i * 7) % 24)}%`} height={12} />
        </div>
      ))}
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
      <TeamIdentity team={team} />

      <SectionHeader title="Ratings" />
      <RatingRow
        ratings={[
          { label: 'Overall', rating: team.overall, band: team.overallBand },
          { label: 'Offence', rating: team.offense, band: team.offenseBand },
          { label: 'Defence', rating: team.defense, band: team.defenseBand },
          { label: 'Special teams', rating: team.specialTeams, band: team.specialTeamsBand },
        ]}
      />

      <SectionHeader title="Front office" />
      <div data-testid="front-office" style={{ minWidth: 0 }}>
        <Fact label="Cap space" value={capIn(team.capSpace)} />
        <Fact label="Draft capital" value={draftIn(team.draftLabel, team.draftScore)} />
        <Fact
          label="Roster age"
          value={team.averageAge === null ? null : `${team.averageAge.toFixed(1)} years`}
        />
        <Fact
          label="Roster count"
          value={team.rosterCount === null ? null : `${String(team.rosterCount)} players`}
        />
        <Fact
          label="Owner patience"
          value={team.ownerMood === null || team.ownerPatience === null
            ? null
            : `${team.ownerMood} · ${String(team.ownerPatience)}`}
        />
        {/* Said in words rather than as a score, because the number behind it
            is the market's size and calling that "fan pressure: 7" would
            suggest a crowd the world simulates and does not. */}
        <Fact label="Fan pressure" value={team.fanPressure} testId="fact-fans" />
        <Fact
          label="Stadium"
          value={team.stadiumCapacity === null
            ? null
            : `${team.stadiumCapacity.toLocaleString('en-US')} seats`}
        />
        <Fact label="Franchise status" value={team.franchiseStatus} testId="fact-status" />
      </div>

      <SectionHeader title="Football situation" />
      <div data-testid="football-situation" style={{ minWidth: 0 }}>
        <Fact label="Quarterback" value={team.quarterbackStatus} testId="fact-qb" />
        <Fact label="Best player" value={playerIn(team.bestPlayer)} />
        <Fact label="Top young player" value={playerIn(team.youngPlayer)} />
        <Fact label="Biggest weakness" value={team.biggestWeakness} />
        <Fact label="Roster timeline" value={team.rosterTimeline} />
      </div>

      {team.suggestedMove !== null && (
        <div
          data-testid="first-move"
          style={{
            marginTop: S[4], padding: `${String(S[3])}px ${String(S[4])}px`,
            borderRadius: R.md,
            background: 'rgba(0,0,0,0.2)',
            // Amber down the left edge only: the report's one instruction,
            // marked the way this app marks the thing to look at.
            borderTop: `1px solid ${COLOR.line}`,
            borderRight: `1px solid ${COLOR.line}`,
            borderBottom: `1px solid ${COLOR.line}`,
            borderLeft: `2px solid ${COLOR.amber}`,
          }}
        >
          <p style={{ ...TYPE.micro, margin: 0, color: COLOR.amber, fontSize: 10 }}>
            Suggested first move
          </p>
          <p style={{ ...TYPE.body, margin: `${String(S[1])}px 0 0`, color: COLOR.tx }}>
            {team.suggestedMove}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: S[2], marginTop: S[6] }}>
        <ActionButton onClick={onConfirm} disabled={busy !== null} testId="confirm-team">
          {busy ?? 'Choose This Team'}
        </ActionButton>
        <ActionButton tone="quiet" onClick={onBack} disabled={busy !== null} testId="back-to-board">
          Back to Teams
        </ActionButton>
      </div>
    </>
  );
}

/** What the screen looks like while the board is being read: the same three
 *  shapes in the same places, so nothing reflows when the club arrives. */
export function TeamPreviewSkeleton() {
  return (
    <div data-testid="preview-skeleton">
      <TeamIdentitySkeleton />
      <SectionHeader title="Ratings" />
      <RatingRowSkeleton />
      <SectionHeader title="Front office" />
      <FactsSkeleton rows={8} />
      <SectionHeader title="Football situation" />
      <FactsSkeleton rows={5} />
    </div>
  );
}
