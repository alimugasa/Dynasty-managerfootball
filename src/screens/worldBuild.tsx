// Building the franchise world.
//
// Ten steps, and an honest account of what this screen can and cannot know.
// create-save writes the whole world in one transaction, which is what lets it
// promise that a failure leaves the save file empty -- and rows inside an open
// transaction are invisible to every other connection, so there is nothing to
// poll and nothing to stream while it runs. The steps are therefore *reported*,
// not narrated: the server records what each one produced and hands the list
// back when the franchise commits.
//
// So the screen shows the ten steps from the first frame, marks them building
// while the call is in flight, and then checks them off with the count each one
// actually wrote. Every number on it came off the rows themselves. The line at
// the foot says so, because a checklist that ticked along to a timer would be
// a progress bar with no progress behind it.

import { COLOR, ELEV, FONT, MOTION, R, S, TYPE, tint } from '../app/tokens';
import { ActionButton } from '../components/ActionButton';
import { TeamMark } from '../components/TeamMark';
import { CheckIcon } from '../components/icons';
import { BUILD_STEPS, type BuildStep } from '../../supabase/functions/_shared/api/buildSteps';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';

/** Where the build has got to. `done` is the finishing beat before the route
 *  changes, which exists so the screen does not flash away the instant the
 *  last check lands. */
export type BuildPhase = 'building' | 'reporting' | 'done' | 'failed';

/** Floodlights over a dark field: two soft pools of the club's own colours and
 *  a faint grid, laid over the app's ink rather than used neat. */
export function stadiumBackdrop(primary: string, secondary: string): string {
  return [
    `radial-gradient(120% 70% at 18% -10%, ${tint(primary, 0.22)} 0%, transparent 60%)`,
    `radial-gradient(120% 70% at 82% -10%, ${tint(secondary, 0.16)} 0%, transparent 60%)`,
    `repeating-linear-gradient(90deg, ${tint(COLOR.line2, 0.5)} 0 1px, transparent 1px 44px)`,
    `repeating-linear-gradient(0deg, ${tint(COLOR.line2, 0.32)} 0 1px, transparent 1px 44px)`,
  ].join(', ');
}

function StepIcon({ state }: { readonly state: 'pending' | 'active' | 'done' | 'failed' }) {
  if (state === 'done') {
    return (
      <span style={{ display: 'flex', color: COLOR.amber }}>
        <CheckIcon size={16} />
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span
        style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: tint(COLOR.red, 0.2), border: `1px solid ${COLOR.red}`,
          color: COLOR.red, fontFamily: FONT.display, fontSize: 11, fontWeight: 700,
        }}
      >
        !
      </span>
    );
  }
  if (state === 'active') {
    // A ring with a gap, turning. The one moving thing on the screen.
    return (
      <span
        className="dmp-spin"
        style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${tint(COLOR.amber, 0.28)}`,
          borderTopColor: COLOR.amber,
        }}
      />
    );
  }
  return (
    <span
      style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${COLOR.line2}`,
      }}
    />
  );
}

function StepRow({ label, detail, state }: {
  readonly label: string;
  readonly detail: string | null;
  readonly state: 'pending' | 'active' | 'done' | 'failed';
}) {
  const colour = state === 'done'
    ? COLOR.tx
    : state === 'active'
      ? COLOR.amber
      : state === 'failed' ? COLOR.red : COLOR.dim;
  return (
    <div
      data-testid={`build-step-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
      data-state={state}
      style={{
        display: 'flex', alignItems: 'center', gap: S[3], minWidth: 0,
        padding: `${String(S[2])}px 0`,
        transition: `color ${MOTION.base} ${MOTION.ease}`,
      }}
    >
      <StepIcon state={state} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...TYPE.body, display: 'block', color: colour }}>{label}</span>
        {detail !== null && (
          <span
            className="numeric"
            style={{ ...TYPE.prose, display: 'block', color: COLOR.mut, fontSize: 11 }}
          >
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}

/** What a finished step says under its name. */
export function stepDetail(step: BuildStep | undefined): string | null {
  if (step === undefined) return null;
  if (step.count === null || step.unit === null) return 'Ready';
  return `${step.count.toLocaleString('en-US')} ${step.unit}`;
}

export function WorldBuild({
  team, gmName, slot, phase, steps, shown, failedStep, onRetry, onMenu,
}: {
  readonly team: TeamProfile | null;
  readonly gmName: string;
  readonly slot: number;
  readonly phase: BuildPhase;
  /** What the server reported, once it has. Empty while the call is in flight. */
  readonly steps: readonly BuildStep[];
  /** How many of the reported steps have been checked off so far. */
  readonly shown: number;
  /** The step the server named when it failed, or null where the failure was
   *  not a step -- a refused request never reached the build. */
  readonly failedStep: string | null;
  readonly onRetry: () => void;
  readonly onMenu: () => void;
}) {
  const building = phase === 'building';
  const failed = phase === 'failed';

  return (
    <div style={{ minWidth: 0 }}>
      <section
        style={{
          position: 'relative', overflow: 'hidden',
          borderRadius: R.lg, border: `1px solid ${COLOR.line2}`,
          boxShadow: ELEV.mid, padding: S[4], marginTop: S[1],
          background: COLOR.panel,
          backgroundImage: team === null
            ? undefined
            : stadiumBackdrop(team.primary, team.secondary),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: S[3], minWidth: 0 }}>
          {team !== null && (
            <TeamMark
              abbreviation={team.abbreviation}
              primary={team.primary}
              secondary={team.secondary}
              size={48}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0, fontFamily: FONT.display, fontSize: 20, fontWeight: 600,
                color: COLOR.tx,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {team?.fullName ?? 'Your franchise'}
            </p>
            <p style={{ ...TYPE.prose, margin: '2px 0 0', color: COLOR.mut, fontSize: 12 }}>
              {gmName} · File {slot}
            </p>
          </div>
        </div>
      </section>

      <div
        data-testid="build-steps"
        style={{
          marginTop: S[4], padding: `${String(S[2])}px ${String(S[4])}px`,
          borderRadius: R.lg, background: 'rgba(0,0,0,0.2)',
          border: `1px solid ${COLOR.line}`, minWidth: 0,
        }}
      >
        {BUILD_STEPS.map((def, i) => {
          const reported = steps.find((s) => s.key === def.key);
          const state = failed
            ? (failedStep === def.key ? 'failed' : i < shown ? 'done' : 'pending')
            : i < shown ? 'done'
              : building && i === 0 ? 'active'
                : phase === 'reporting' && i === shown ? 'active' : 'pending';
          return (
            <StepRow
              key={def.key}
              label={def.label}
              detail={state === 'done' ? stepDetail(reported) : null}
              state={state}
            />
          );
        })}
      </div>

      {failed && (
        <div
          data-testid="build-failed"
          style={{
            marginTop: S[4], padding: S[4], borderRadius: R.lg,
            background: tint(COLOR.red, 0.1),
            border: `1px solid ${tint(COLOR.red, 0.55)}`,
          }}
        >
          <p style={{ ...TYPE.heading, margin: 0, fontSize: 15, color: COLOR.red }}>
            {failedStep === null
              ? 'The franchise was not created'
              : `${BUILD_STEPS.find((s) => s.key === failedStep)?.label ?? failedStep} failed`}
          </p>
          <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0 0`, color: COLOR.tx }}>
            File {slot} is still empty. The world is written in one transaction, so nothing
            was half built and there is nothing to clean up before trying again.
          </p>
          <div style={{ display: 'grid', gap: S[2], marginTop: S[4] }}>
            {/* "Retry" rather than "retry this step": there is no half-built
                world to resume from, and a button that claimed otherwise would
                be describing an architecture this one does not have. */}
            <ActionButton onClick={onRetry} testId="build-retry">
              Retry
            </ActionButton>
            <ActionButton tone="quiet" onClick={onMenu} testId="build-menu">
              Return to Main Menu
            </ActionButton>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <p
          data-testid="build-opening"
          style={{ ...TYPE.heading, margin: `${String(S[4])}px 0 0`, fontSize: 15, color: COLOR.amber }}
        >
          Opening front office…
        </p>
      )}

      {!failed && (
        <p
          data-testid="build-note"
          style={{ ...TYPE.prose, margin: `${String(S[4])}px 2px 0`, color: COLOR.dim, fontSize: 12 }}
        >
          The world is written in one transaction, so nothing exists part-way. Each count
          below a step is the rows that step actually wrote, reported when the franchise
          commits.
        </p>
      )}
    </div>
  );
}
