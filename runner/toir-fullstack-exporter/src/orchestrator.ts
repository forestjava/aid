import path from 'node:path';
import { promises as fs } from 'node:fs';
import { config } from './config.js';
import { generateSlug } from './deploy/slug.js';
import { materializeMockProject } from './generator/materialize.js';
import { fetchSourceContent } from './fetchSource.js';
import { freezeContract, type FrozenContract } from './generator/contractFreeze.js';
import { copyScaffold } from './generator/scaffold.js';
import { syncContext } from './generator/contextSync.js';
import { postProcessCompose } from './generator/postProcess.js';
import { runValidator } from './generator/validate.js';
import { runTsCheck } from './generator/tsCheck.js';
import { runPrismaStage } from './generator/stages/prismaStage.js';
import { runNestEntityStage } from './generator/stages/nestEntityStage.js';
import { runReactEntityStage } from './generator/stages/reactEntityStage.js';
import { runIntegrationStage } from './generator/stages/integrationStage.js';
import { runAuthStage } from './generator/stages/authStage.js';
import {
  runStageWithRepair,
  type StageFn,
  type StageInput,
  type StageName,
} from './generator/repair.js';
import { deployProject, type DeployResult } from './deploy/index.js';
import { rollback, type DeploymentContext } from './deploy/rollback.js';
import { sendProgress } from './progress.js';
import { writeResultFile } from './writeback.js';

/**
 * Top-level pipeline for one job.
 *
 * Pipeline stages (Phase 6+ status):
 *   0  fetch DSL                       — real
 *   1  contract-freeze                 — real (deterministic)
 *   2  scaffold                        — real (copies templates from context/scaffold/)
 *   3  context sync (api-summary)      — real (generates api-summary.json from contract)
 *   4  prisma stage                    — LLM + bounded repair (Phase 8)
 *   5  nest entity stage               — LLM + bounded repair (Phase 9)
 *   6  react entity stage              — LLM + bounded repair (Phase 9)
 *   7  integration stage               — LLM + bounded repair (Phase 10)
 *   8  auth stage                      — LLM + bounded repair (Phase 10)
 *   9  post-processing (compose)       — real (deterministic; skipped if absent)
 *  10  validation                      — real
 *  11+ deploy (gitea/portainer/npm)    — real, only when validation passes
 *
 * When `EXPORTER_MOCK_GENERATOR=true`, stages 1-10 are bypassed and the bundled
 * mock-project is materialized instead, preserving the Phase 5 fallback path.
 */
export async function runJob(jobId: string, dslPath: string): Promise<void> {
  console.log(`\n[${jobId}] runJob start path=${dslPath}`);
  const slug = generateSlug(jobId);
  const ctx: DeploymentContext = { jobId, slug, cleanupLog: [] };

  try {
    await sendProgress(jobId, 'started', `Job accepted (slug=${slug})`);

    const localDir = config.EXPORTER_MOCK_GENERATOR
      ? await runMockGenerator(jobId, slug)
      : await runRealGenerator(jobId, slug, dslPath);

    const result = await deployProject(ctx, localDir);

    await sendProgress(jobId, 'processing', `[writeback] Saving deploy metadata`);
    const deployMdPath = replaceExt(dslPath, '.deploy.md');
    await writeResultFile(deployMdPath, renderDeployMd(slug, result));

    await sendProgress(jobId, 'completed', `Deployed: ${result.url}`);
    console.log(`[${jobId}] completed url=${result.url}`);
  } catch (err) {
    // Preserve the ORIGINAL error — rollback runs best-effort and must not
    // override what AID sees.
    const originalMessage = (err as Error).message;
    console.error(`[${jobId}] FAILED: ${originalMessage}`);

    await sendProgress(jobId, 'processing', `[rollback] Cleaning up partial state`);
    try {
      await rollback(ctx);
    } catch (rollbackErr) {
      // rollback() is documented as never-throws, but belt-and-braces here
      // ensures a bug there can never mask the original failure.
      console.error(
        `[${jobId}] rollback() unexpectedly threw: ${(rollbackErr as Error).message}`,
      );
    }

    // Echo the cleanup log to job progress so it shows up in AID's stream.
    for (const line of ctx.cleanupLog) {
      await sendProgress(jobId, 'processing', `[rollback] ${line}`);
    }

    // Best-effort writeback of the failure report (with cleanup log) to disk.
    try {
      const deployMdPath = replaceExt(dslPath, '.deploy.md');
      await writeResultFile(
        deployMdPath,
        renderFailedDeployMd(slug, originalMessage, ctx.cleanupLog),
      );
    } catch (writeErr) {
      console.error(
        `[${jobId}] failed to write failure report: ${(writeErr as Error).message}`,
      );
    }

    await sendProgress(jobId, 'failed', originalMessage);
  }
}

async function runMockGenerator(jobId: string, slug: string): Promise<string> {
  await sendProgress(jobId, 'processing', `[materialize] Copying mock project (slug=${slug})`);
  return materializeMockProject(jobId, slug);
}

async function runRealGenerator(
  jobId: string,
  slug: string,
  dslPath: string,
): Promise<string> {
  const workingDir = `/tmp/jobs/${jobId}`;
  await fs.rm(workingDir, { recursive: true, force: true });
  await fs.mkdir(workingDir, { recursive: true });

  // Stage 0 — fetch DSL
  await sendProgress(jobId, 'processing', `[fetch] Loading DSL from ${dslPath}`);
  const dslContent = await runStage(jobId, 'fetch', () => fetchSourceContent(dslPath));

  // Stage 1 — contract freeze
  await sendProgress(jobId, 'processing', `[contract-freeze] Parsing DSL`);
  const contract = await runStage(jobId, 'contract-freeze', () => freezeContract(dslContent));
  await sendProgress(
    jobId,
    'processing',
    `[contract-freeze] entities=${contract.entities.length} enums=${contract.enums.length} dtos=${contract.dtos.length} endpoints=${contract.endpoints.length}`,
  );

  // Stage 2 — scaffold
  await sendProgress(jobId, 'processing', `[scaffold] Copying scaffold templates`);
  const scaffold = await runStage(jobId, 'scaffold', () => copyScaffold(workingDir));
  if (scaffold.missing) {
    await sendProgress(
      jobId,
      'processing',
      `[scaffold] No scaffold templates present (critical: needs Phase 6.5)`,
    );
  } else {
    await sendProgress(jobId, 'processing', `[scaffold] Copied ${scaffold.copied.length} files`);
  }

  // Stage 3 — context sync (write DSL to domain/ + generate api-summary.json)
  await sendProgress(jobId, 'processing', `[context-sync] Writing domain/*.api.dsl and api-summary.json`);
  await runStage(jobId, 'context-sync', () => syncContext(workingDir, dslContent));
  await sendProgress(jobId, 'processing', `[context-sync] Wrote domain/main.api.dsl and api-summary.json`);

  // Stages 4-8 — LLM stages with bounded one-pass repair (Phase 11).
  // Each stage runs through `runStageWithRepair`, which writes the stage's
  // files, runs the structural validator, and — if the validator reports a
  // failure that touches THIS stage's write zones — re-runs the stage exactly
  // once with the validator output appended to the prompt as feedback. After
  // a single repair pass we either pass validation or throw and fail the job.
  await runLlmStage(jobId, 'prisma', workingDir, contract, runPrismaStage);
  await runLlmStage(jobId, 'nest-entities', workingDir, contract, (input) =>
    runNestEntityStage({
      ...input,
      onProgress: (msg) => sendProgress(jobId, 'processing', `[nest-entities] ${msg}`),
    }),
  );
  await runLlmStage(jobId, 'react-entities', workingDir, contract, (input) =>
    runReactEntityStage({
      ...input,
      onProgress: (msg) => sendProgress(jobId, 'processing', `[react-entities] ${msg}`),
    }),
  );
  await runLlmStage(jobId, 'integration', workingDir, contract, runIntegrationStage);
  await runLlmStage(jobId, 'auth', workingDir, contract, runAuthStage);

  // Stage 8 — TypeScript build check with one repair pass
  await runTsBuildCheck(jobId, workingDir, contract);

  // Stage 9 — post-processing
  await sendProgress(jobId, 'processing', `[post-process] Rewriting docker-compose.yml`);
  const post = await runStage(jobId, 'post-process', () =>
    postProcessCompose(workingDir, { slug }),
  );
  if (!post.applied) {
    await sendProgress(jobId, 'processing', `[post-process] Skipped: ${post.reason}`);
  }

  // Stage 9 — validation
  await sendProgress(jobId, 'processing', `[validate] Running structural validator`);
  const validation = await runStage(jobId, 'validate', () => runValidator(workingDir));
  if (!validation.ok) {
    const detail =
      validation.error ||
      validation.stderr.trim() ||
      validation.stdout.trim() ||
      `validator exited with code ${validation.exitCode}`;
    throw new Error(`Validation failed: ${detail}`);
  }
  await sendProgress(jobId, 'processing', `[validate] Validator passed`);

  return workingDir;
}

/**
 * Runs an LLM stage through the bounded one-pass repair helper. The helper
 * writes files, runs the structural validator, and — on a stage-owned failure
 * — re-runs the stage exactly ONCE with `previousError` populated. A second
 * failure on the same stage rejects the whole job.
 */
async function runLlmStage(
  jobId: string,
  name: StageName,
  workingDir: string,
  contract: FrozenContract,
  stage: StageFn,
): Promise<void> {
  await sendProgress(jobId, 'processing', `[${name}] Running stage`);
  const log = (msg: string) => sendProgress(jobId, 'processing', msg);

  const result = await runStage(jobId, name, () =>
    runStageWithRepair(name, stage, { contract } satisfies StageInput, {
      workingDir,
      log,
    }),
  );

  await sendProgress(jobId, 'processing', `[${name}] Wrote ${result.files.length} files`);
}

/**
 * Runs TypeScript compilation check (npm install + prisma generate + tsc --noEmit)
 * against the generated server code. On failure, re-runs nest-entities and integration
 * stages with the TS errors as repair feedback, then checks again.
 */
async function runTsBuildCheck(
  jobId: string,
  workingDir: string,
  contract: FrozenContract,
): Promise<void> {
  await sendProgress(jobId, 'processing', `[ts-build] Running TypeScript check`);

  const first = await runTsCheck(workingDir);
  if (first.ok) {
    await sendProgress(jobId, 'processing', `[ts-build] TypeScript check passed`);
    return;
  }

  const tsErrors = (first.stdout + '\n' + first.stderr).trim();
  await sendProgress(jobId, 'processing', `[ts-build] TypeScript errors found — running repair`);
  console.warn(`[${jobId}] ts-build errors:\n${tsErrors}`);

  // Repair pass: re-run nest-entities and integration with TS errors as feedback
  const repairInput = { contract, previousError: `TypeScript compilation failed:\n\n${tsErrors}` };

  await runLlmStage(jobId, 'nest-entities', workingDir, contract, (input) =>
    runNestEntityStage({
      ...input,
      ...repairInput,
      onProgress: (msg) => sendProgress(jobId, 'processing', `[nest-entities] ${msg}`),
    }),
  );
  await runLlmStage(jobId, 'integration', workingDir, contract, (input) =>
    runIntegrationStage({ ...input, ...repairInput }),
  );

  // Re-check after repair
  await sendProgress(jobId, 'processing', `[ts-build] Re-checking TypeScript after repair`);
  const second = await runTsCheck(workingDir);
  if (!second.ok) {
    const detail = (second.stdout + '\n' + second.stderr).trim();
    throw new Error(`TypeScript build failed after repair:\n\n${detail}`);
  }
  await sendProgress(jobId, 'processing', `[ts-build] TypeScript check passed after repair`);
}

async function runStage<T>(jobId: string, name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[${jobId}] stage "${name}" failed: ${message}`);
    throw new Error(`stage ${name} failed: ${message}`);
  }
}

function replaceExt(filePath: string, newExt: string): string {
  const ext = path.extname(filePath);
  return ext ? filePath.slice(0, -ext.length) + newExt : filePath + newExt;
}

function renderDeployMd(slug: string, r: DeployResult): string {
  return [
    '# Deployed',
    '',
    `- URL: ${r.url}`,
    `- Slug: ${slug}`,
    `- Gitea: ${r.giteaRepoUrl}`,
    `- Portainer stack ID: ${r.stackId}`,
    `- NPM proxy host ID: ${r.proxyHostId}`,
    `- Created: ${new Date().toISOString()}`,
    '',
  ].join('\n');
}

function renderFailedDeployMd(
  slug: string,
  errorMessage: string,
  cleanupLog: string[],
): string {
  const lines = [
    '# Deployment FAILED',
    '',
    `- Slug: ${slug}`,
    `- Failed at: ${new Date().toISOString()}`,
    '',
    '## Error',
    '',
    '```',
    errorMessage,
    '```',
    '',
    '## Rollback log',
    '',
  ];
  if (cleanupLog.length === 0) {
    lines.push('_(no cleanup actions were taken)_');
  } else {
    for (const entry of cleanupLog) {
      lines.push(`- ${entry}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
