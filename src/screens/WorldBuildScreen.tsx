// Building the franchise world, wired to the one call that writes it.
//
// This screen owns the creation. Confirm Franchise pushes it and it runs
// create-save on arrival, which is why the guard against creating twice lives
// in a ref here rather than in a busy flag: React state lands a render later,
// and a screen that mounted twice in that window would ask for two franchises
// in the same file.
//
// What it can honestly show is set by how the world is written. create-save is
// one transaction, so a failure leaves nothing behind -- and so nothing can be
// observed part-way. The steps are therefore reported when the franchise
// commits, with the count each one wrote, and checked off in order once they
// arrive. See worldBuild.tsx.

import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { useFranchiseSetup } from '../app/FranchiseSetup';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import { saveNameOf } from './franchiseSummary';
import { WorldBuild, type BuildPhase } from './worldBuild';
import { BUILD_STEPS, type BuildStep } from '../../supabase/functions/_shared/api/buildSteps';
import type { TeamProfilesOut } from '../../supabase/functions/_shared/api/reads/teamProfiles';

/** How long the reported steps take to check off, in total. They are already
 *  true when they arrive -- this is a reveal, not a measurement -- so it is
 *  short enough to read and too short to feel like waiting. */
const REVEAL_MS = 900;

/** The pause on "Opening front office…" before the dashboard takes over, so
 *  the last check is seen rather than flashed away. */
const FINISH_MS = 650;

export function WorldBuildScreen() {
  const nav = useNavigator();
  const { draft } = useFranchiseSetup();
  const { startDynasty, version } = useSave();
  const q = useQuery<TeamProfilesOut>('team-profiles', {}, version);

  const [phase, setPhase] = useState<BuildPhase>('building');
  const [steps, setSteps] = useState<readonly BuildStep[]>([]);
  const [shown, setShown] = useState(0);
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Set before the call and cleared only when it comes back, so a remount or a
  // fast retry cannot start a second franchise in the same file.
  const running = useRef(false);
  const attempt = useRef(0);

  const first = draft?.firstName.trim() ?? '';
  const last = draft?.lastName.trim() ?? '';
  const teamId = draft?.teamId ?? null;
  const ready = draft !== null && first !== '' && last !== '' && teamId !== null;
  const team = q.status === 'ready' && teamId !== null
    ? q.data.teams.find((t) => t.teamId === teamId) ?? null
    : null;

  const build = useCallback(() => {
    if (draft === null || teamId === null || running.current) return;
    running.current = true;
    setPhase('building');
    setSteps([]);
    setShown(0);
    setFailedStep(null);
    setMessage(null);
    void startDynasty({
      slot: draft.slot, teamId,
      name: saveNameOf(draft.saveName, team).trim(),
      gmFirstName: first, gmLastName: last,
      gmStyle: draft.style,
      settings: draft.settings,
    })
      .then((out) => {
        running.current = false;
        setSteps(out.steps);
        setPhase('reporting');
      })
      .catch((error: unknown) => {
        running.current = false;
        const failure = error as { step?: string; message?: string };
        // The server names the step it was on when a build step throws. A
        // request refused before the build started -- a taken slot, a rule it
        // could not read -- names none, and the card says so instead.
        setFailedStep(typeof failure.step === 'string' ? failure.step : null);
        setMessage(error instanceof Error ? error.message : String(error));
        setPhase('failed');
      });
  }, [draft, teamId, team, first, last, startDynasty]);

  // Runs once on arrival. The ref is what makes that true under a remount.
  useEffect(() => {
    if (!ready || q.status !== 'ready' || attempt.current > 0) return;
    attempt.current += 1;
    build();
  }, [ready, q.status, build]);

  // Checking the reported steps off, one after another.
  useEffect(() => {
    if (phase !== 'reporting') return undefined;
    if (shown >= BUILD_STEPS.length) {
      const done = setTimeout(() => { setPhase('done'); }, 0);
      return () => { clearTimeout(done); };
    }
    const tick = setTimeout(
      () => { setShown((n) => n + 1); }, REVEAL_MS / BUILD_STEPS.length);
    return () => { clearTimeout(tick); };
  }, [phase, shown]);

  // The save is already open by now -- startDynasty reloaded it before it
  // resolved -- so this is the beat before OpenSaveRouter takes the player to
  // the dashboard, not a navigation of its own.
  useEffect(() => {
    if (phase !== 'done') return undefined;
    const go = setTimeout(() => { nav.replaceRoot('team'); }, FINISH_MS);
    return () => { clearTimeout(go); };
  }, [phase, nav]);

  return (
    <Screen
      title="Building Franchise World"
      subtitle={ready ? `${first} ${last} · File ${String(draft.slot)}` : ''}
      screen="worldGen"
    >
      {!ready && (
        <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0`, color: COLOR.red }}>
          This screen was opened before a file, a GM and a team were chosen. Go back and
          start again from New Franchise.
        </p>
      )}
      {message !== null && (
        <p data-testid="notice" style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}>
          {message}
        </p>
      )}
      {q.status === 'error' && <QueryError error={q.error} />}

      {ready && (
        <WorldBuild
          team={team}
          gmName={`${first} ${last}`}
          slot={draft.slot}
          phase={phase}
          steps={steps}
          shown={shown}
          failedStep={failedStep}
          onRetry={build}
          onMenu={() => { nav.replaceRoot('home'); }}
        />
      )}
    </Screen>
  );
}
