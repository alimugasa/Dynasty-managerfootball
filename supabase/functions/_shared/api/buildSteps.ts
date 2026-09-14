// What building a franchise actually consists of, and what each step produced.
//
// create-save does all of this in one transaction, which is what lets it
// promise that a failure leaves the save file empty. That promise is also why
// the client cannot watch the steps tick by: rows written inside an uncommitted
// transaction are invisible to every other connection, so there is nothing to
// poll and nothing to stream without giving the atomicity up.
//
// So the steps are reported rather than narrated. Each one records the count it
// actually produced -- counted from the rows it wrote, not asserted -- and a
// step that throws names itself on the way out, which is how the screen can say
// "Schedule generation failed" instead of showing a stack trace.

/** The ten steps, in the order create-save performs them. The client renders
 *  this list before the call returns, so the keys and the labels live here
 *  rather than being invented by whichever screen is showing them. */
export const BUILD_STEPS = [
  { key: 'league', label: 'Creating league structure' },
  { key: 'teams', label: 'Creating teams' },
  { key: 'players', label: 'Generating players' },
  { key: 'rosters', label: 'Assigning rosters' },
  { key: 'contracts', label: 'Creating contracts' },
  { key: 'depth', label: 'Building depth charts' },
  { key: 'schedule', label: 'Generating schedule' },
  { key: 'picks', label: 'Setting draft picks' },
  { key: 'news', label: 'Preparing news feed' },
  { key: 'office', label: 'Opening front office' },
] as const;

export type BuildStepKey = (typeof BUILD_STEPS)[number]['key'];

export interface BuildStep {
  readonly key: BuildStepKey;
  readonly label: string;
  /** What the step produced, counted. Null where the step is work rather than
   *  rows -- opening the front office writes the save document, and "1" would
   *  be a number pretending to be a measurement. */
  readonly count: number | null;
  /** What the count is of, for the line under the step. Null with the count. */
  readonly unit: string | null;
}

/** A step that failed, named. Thrown so the transaction unwinds and caught at
 *  the edge, where it becomes the message the failure card shows. */
export class BuildStepError extends Error {
  readonly step: BuildStepKey;
  readonly stepLabel: string;

  constructor(step: BuildStepKey, cause: unknown) {
    const label = BUILD_STEPS.find((s) => s.key === step)?.label ?? step;
    super(`${label} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'BuildStepError';
    this.step = step;
    this.stepLabel = label;
  }
}

/** Runs one step, naming it if it throws. */
export async function runStep<T>(key: BuildStepKey, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    // A step that already named itself -- a nested one -- keeps its own name:
    // the innermost failure is the useful one.
    if (error instanceof BuildStepError) throw error;
    throw new BuildStepError(key, error);
  }
}

export function step(key: BuildStepKey, count: number | null, unit: string | null): BuildStep {
  return {
    key,
    label: BUILD_STEPS.find((s) => s.key === key)?.label ?? key,
    count,
    unit,
  };
}
