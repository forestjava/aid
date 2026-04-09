import type { TsCheckResult } from './tsCheck.js';

/**
 * Dependencies required by `runTsBuildCheck`. Injected so the function can be
 * unit-tested without spawning real npm/tsc processes or touching real LLM
 * stages.
 */
export interface TsBuildCheckDeps {
  /** Runs the actual `npm install + prisma generate + tsc --noEmit` pipeline. */
  tsCheck: (workingDir: string) => Promise<TsCheckResult>;
  /**
   * Re-runs the set of LLM stages that could be responsible for a tsc error,
   * in the fixed repair-sweep order (`shared-types → nest-entities → integration`).
   * Receives the TypeScript error text so stages can embed it as repair feedback.
   */
  rerunStages: (feedback: string) => Promise<void>;
  /** Progress logger (usually `sendProgress` bound to a job id). */
  log: (message: string) => Promise<void>;
}

/**
 * Runs a TypeScript compilation check against the generated server code.
 *
 * Flow:
 *   1. tsCheck() — on success, return.
 *   2. If the failure has an `error` field (npm install or prisma generate
 *      broke), throw immediately. Repair cannot fix infrastructure problems.
 *   3. Otherwise run the repair sweep once with the TS output as feedback.
 *   4. tsCheck() again. On success, return. On failure, throw with full TS
 *      output so the orchestrator's rollback sees exactly why the job failed.
 */
export async function runTsBuildCheck(
  workingDir: string,
  deps: TsBuildCheckDeps,
): Promise<void> {
  await deps.log('[ts-build] Running TypeScript check');

  const first = await deps.tsCheck(workingDir);
  if (first.ok) {
    await deps.log('[ts-build] TypeScript check passed');
    return;
  }

  if (first.error) {
    // Infra failure — npm install or prisma generate exploded. Repair
    // cannot fix this; surface the underlying error immediately.
    throw new Error(`ts-build: ${first.error}`);
  }

  const tsErrors = combineOutput(first);
  await deps.log('[ts-build] TypeScript errors found — running repair sweep');

  const feedback = `TypeScript compilation failed:\n\n${tsErrors}`;
  await deps.rerunStages(feedback);

  await deps.log('[ts-build] Re-checking TypeScript after repair');
  const second = await deps.tsCheck(workingDir);
  if (second.ok) {
    await deps.log('[ts-build] TypeScript check passed after repair');
    return;
  }

  if (second.error) {
    throw new Error(`ts-build: ${second.error}`);
  }

  const secondErrors = combineOutput(second);
  throw new Error(`TypeScript build failed after repair:\n\n${secondErrors}`);
}

function combineOutput(result: TsCheckResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}
