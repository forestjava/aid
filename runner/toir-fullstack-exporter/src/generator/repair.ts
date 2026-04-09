import path from 'node:path';
import { promises as fs } from 'node:fs';

import type { FrozenContract } from './contractFreeze.js';
import type { FileEntry, StageResult } from './stages/types.js';
import { runValidator, type ValidateResult } from './validate.js';

/**
 * Phase 11 — bounded one-pass repair.
 *
 * After each LLM stage completes, the orchestrator writes its files to disk
 * and re-runs the structural validator. The validator emits failure lines like
 * `- Missing file: server/prisma/schema.prisma`. We parse those lines, map the
 * mentioned file paths to the stage that owns them, and decide whether the
 * just-run stage is responsible for any of the failures.
 *
 * If the just-run stage owns one or more failures, the helper re-runs the same
 * stage exactly once with `previousError` populated, so the LLM gets explicit
 * feedback about what went wrong. After that single repair pass we re-validate
 * one more time. If failures owned by this stage still remain, the helper
 * throws an error that includes both attempts' validator output, and the
 * orchestrator marks the job `failed`. There is no third attempt — repair is
 * strictly bounded per stage per job.
 *
 * Deterministic stages (contract-freeze, scaffold, post-process, the final
 * full validation) are NOT routed through this helper.
 */

export type StageName =
  | 'prisma'
  | 'shared-types'
  | 'nest-entities'
  | 'react-entities'
  | 'integration'
  | 'auth';

export interface StageInput {
  contract: FrozenContract;
  /**
   * When set, the LLM stage MUST append this text to its user prompt as
   * repair feedback so the model can fix its previous output.
   */
  previousError?: string;
  /** Per-entity / sub-step progress callback (used by nest/react stages). */
  onProgress?: (message: string) => void | Promise<void>;
}

export type StageFn = (input: StageInput) => Promise<StageResult>;

export interface ValidatorFailure {
  /** Raw failure message line as printed by the validator (without the leading "- "). */
  message: string;
  /** Repo-relative file paths heuristically extracted from the message. */
  files: string[];
}

interface StageZone {
  stage: StageName;
  /** Path-prefix or exact-match patterns owned by this stage. */
  patterns: RegExp[];
}

/**
 * Heuristic stage→file ownership map. Order does not matter — a failure that
 * matches multiple stages will only be attributed to the stage we are asking
 * about. We never silently re-run an unrelated stage.
 */
const STAGE_ZONES: StageZone[] = [
  {
    stage: 'prisma',
    patterns: [/^server\/prisma\//],
  },
  {
    stage: 'shared-types',
    patterns: [/^server\/src\/enums\//, /^server\/src\/shared\//],
  },
  {
    stage: 'nest-entities',
    patterns: [/^server\/src\/modules\//],
  },
  {
    stage: 'react-entities',
    patterns: [/^client\/src\/resources\//],
  },
  {
    stage: 'auth',
    patterns: [/^server\/src\/auth\//, /^client\/src\/auth\//],
  },
  {
    stage: 'integration',
    patterns: [
      /^server\/src\/app\.module\.ts$/,
      /^client\/src\/App\.tsx$/,
      /^client\/src\/dataProvider\.ts$/,
    ],
  },
];

// Matches things that look like repo-relative file paths inside a failure
// message. We require at least one slash AND a file extension to avoid eating
// arbitrary identifiers like `start:dev`.
const PATH_REGEX = /[a-zA-Z][\w./-]*\/[\w./-]+\.[a-zA-Z]\w*/g;

/**
 * Parses validator stdout+stderr into a list of structured failures. The
 * validator prints `Generation validation failed:` followed by one `- <msg>`
 * line per failure (see context/tools/validate-generation.mjs).
 */
export function parseValidatorFailures(output: string): ValidatorFailure[] {
  const failures: ValidatorFailure[] = [];
  for (const rawLine of output.split('\n')) {
    const m = rawLine.match(/^-\s+(.+?)\s*$/);
    if (!m) continue;
    const message = m[1];
    const files = Array.from(new Set(message.match(PATH_REGEX) ?? []));
    failures.push({ message, files });
  }
  return failures;
}

/**
 * Returns the subset of failures whose extracted file paths match the given
 * stage's ownership zones. Failures that mention no file paths are returned
 * with the LATEST stage as a fallback (callers pass `attributeUnknown` for
 * the stage they just ran), so an ambiguous failure does not get silently
 * dropped.
 */
export function failuresForStage(
  failures: ValidatorFailure[],
  stage: StageName,
  attributeUnknown = false,
): ValidatorFailure[] {
  const zone = STAGE_ZONES.find((z) => z.stage === stage);
  const patterns = zone?.patterns ?? [];
  return failures.filter((f) => {
    if (f.files.length === 0) {
      return attributeUnknown;
    }
    return f.files.some((file) => patterns.some((p) => p.test(file)));
  });
}

export function formatFailures(failures: ValidatorFailure[]): string {
  return failures.map((f) => `- ${f.message}`).join('\n');
}

/** Writes a stage's file list to the working directory. */
export async function writeStageFiles(
  workingDir: string,
  files: FileEntry[],
): Promise<void> {
  for (const file of files) {
    const target = path.join(workingDir, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, 'utf8');
  }
}

export interface RepairOptions {
  workingDir: string;
  /** Logger used for `[Stage X] Attempt N/M ...` lines. */
  log: (message: string) => void | Promise<void>;
  /** Strictly bounded; default 2 = one initial attempt + one repair pass. */
  maxAttempts?: number;
  /** Override for tests. Defaults to the real --artifacts-only validator. */
  validate?: (workingDir: string) => Promise<ValidateResult>;
}

/**
 * Runs an LLM stage with bounded one-pass repair.
 *
 * Flow:
 *   1. Call stageFn(input), write files, run validator.
 *   2. If validator passes for this stage's zones → return result.
 *   3. Otherwise build a `previousError` payload from the failures owned by
 *      this stage and call stageFn ONCE more with it. Write, validate again.
 *   4. If still failing → throw with both attempts' errors in the message.
 *
 * The helper never makes a third attempt and never re-runs sibling stages.
 */
export async function runStageWithRepair(
  stageName: StageName,
  stageFn: StageFn,
  input: StageInput,
  opts: RepairOptions,
): Promise<StageResult> {
  const maxAttempts = opts.maxAttempts ?? 2;
  if (maxAttempts < 1) {
    throw new Error(`runStageWithRepair: maxAttempts must be >= 1, got ${maxAttempts}`);
  }
  const validate = opts.validate ?? runValidator;

  const attemptErrors: string[] = [];
  let currentInput: StageInput = input;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isRepair = attempt > 1;
    await opts.log(
      `[Stage ${stageName}] Attempt ${attempt}/${maxAttempts}` +
        (isRepair ? ' with repair feedback' : ''),
    );

    const result = await stageFn(currentInput);
    await writeStageFiles(opts.workingDir, result.files);

    const validation = await validate(opts.workingDir);
    if (validation.ok) {
      if (isRepair) {
        await opts.log(`[Stage ${stageName}] Repair successful`);
      }
      return result;
    }

    const combined = `${validation.stdout}\n${validation.stderr}`;
    const allFailures = parseValidatorFailures(combined);
    // Only attribute failures whose file paths match this stage's zone.
    // Failures without a recognizable path (e.g. "Expected at least one
    // domain/*.api.dsl file", "authProvider must distinguish 401 and 403")
    // belong to other stages or to deterministic setup (scaffold) and are
    // NOT this stage's responsibility — the final full validation will
    // surface them.
    const stageFailures = failuresForStage(allFailures, stageName, false);

    if (stageFailures.length === 0) {
      // Validator failed, but nothing in this stage's zone is broken — that
      // means a SIBLING stage owns the failure. The current stage is fine;
      // let the orchestrator continue and surface the failure when the next
      // stage runs (or via the final validation).
      if (isRepair) {
        await opts.log(`[Stage ${stageName}] Repair successful`);
      }
      return result;
    }

    const errorText = formatFailures(stageFailures);
    attemptErrors.push(`Attempt ${attempt}:\n${errorText}`);
    await opts.log(`[Stage ${stageName}] Validation failed:\n${errorText}`);

    if (attempt === maxAttempts) {
      throw new Error(
        `${stageName} failed validation after repair (${maxAttempts} attempts):\n\n` +
          attemptErrors.join('\n\n'),
      );
    }

    currentInput = { ...currentInput, previousError: errorText };
  }

  // Unreachable: the loop either returns or throws on the last iteration.
  throw new Error(`${stageName} repair loop exited unexpectedly`);
}

/**
 * Helper for stage implementations: returns the user prompt with repair
 * feedback appended in the format mandated by the orchestration contract.
 * Stages call this once when building their LLM request.
 */
export function appendRepairFeedback(userPrompt: string, previousError?: string): string {
  if (!previousError) return userPrompt;
  return (
    userPrompt +
    '\n\nPREVIOUS ATTEMPT FAILED. Validator output:\n\n' +
    previousError +
    '\n\nFix the issues above.'
  );
}
