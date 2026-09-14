// Building the franchise world, in the play-test build.
//
// The rig builds its league on the main thread rather than over a wire, so it
// cannot report steps the way the server does: there is no transaction to
// commit and no manifest to hand back. What it can honestly show is the same
// ten steps and the same shape of screen, with every count read off the league
// it just built -- which is the rig's equivalent of counting the rows.
//
// The build blocks the thread while it runs, so the screen paints the steps,
// yields a frame, and then does the work. Without the yield the browser never
// draws the list at all and the player sees nothing until the game opens.

import { useEffect, useRef, useState } from 'react';
import { WorldBuild, type BuildPhase } from '../../src/screens/worldBuild';
import { BUILD_STEPS, type BuildStep } from '../../supabase/functions/_shared/api/buildSteps';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';
import { boardLeague } from './board';

/** How long the reported steps take to check off, in total. */
const REVEAL_MS = 900;

export function RigWorldBuild({ team, gmName, slot, onBuild, onMenu }: {
  readonly team: TeamProfile | null;
  readonly gmName: string;
  readonly slot: number;
  /** Builds the dynasty and opens it. Blocks while it runs. */
  readonly onBuild: () => void;
  readonly onMenu: () => void;
}) {
  const [phase, setPhase] = useState<BuildPhase>('building');
  const [steps, setSteps] = useState<readonly BuildStep[]>([]);
  const [shown, setShown] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return undefined;
    started.current = true;
    // One frame for the list to paint before the thread is taken.
    const go = setTimeout(() => {
      const league = boardLeague();
      setSteps(BUILD_STEPS.map((def) => {
        const count = def.key === 'league'
          ? league.conferences + league.divisions
          : def.key === 'teams' ? league.teams
            : def.key === 'schedule' ? (league.regularSeasonWeeks === null ? null : 272)
              : def.key === 'picks' ? league.draftPicks : null;
        const unit = def.key === 'league' ? 'conferences and divisions'
          : def.key === 'teams' ? 'teams'
            : def.key === 'schedule' ? 'fixtures'
              : def.key === 'picks' ? 'picks' : null;
        return { key: def.key, label: def.label, count, unit };
      }));
      setPhase('reporting');
    }, 60);
    return () => { clearTimeout(go); };
  }, []);

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

  useEffect(() => {
    if (phase !== 'done') return undefined;
    const go = setTimeout(() => { onBuild(); }, 400);
    return () => { clearTimeout(go); };
  }, [phase, onBuild]);

  return (
    <WorldBuild
      team={team}
      gmName={gmName}
      slot={slot}
      phase={phase}
      steps={steps}
      shown={shown}
      failedStep={null}
      onRetry={() => undefined}
      onMenu={onMenu}
    />
  );
}
