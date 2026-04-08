import path from 'node:path';
import { promises as fs } from 'node:fs';
import { config } from './config.js';
import { generateSlug } from './deploy/slug.js';
import { materializeMockProject } from './generator/materialize.js';
import { fetchSourceContent } from './fetchSource.js';
import { freezeContract, type FrozenContract } from './generator/contractFreeze.js';
import { copyScaffold } from './generator/scaffold.js';
import { postProcessCompose } from './generator/postProcess.js';
import { runValidator } from './generator/validate.js';
import { runPrismaStage } from './generator/stages/prismaStage.js';
import { runNestEntityStage } from './generator/stages/nestEntityStage.js';
import { runReactEntityStage } from './generator/stages/reactEntityStage.js';
import { runIntegrationStage } from './generator/stages/integrationStage.js';
import { runAuthStage } from './generator/stages/authStage.js';
import type { StageResult, FileEntry } from './generator/stages/types.js';
import { deployProject, type DeployResult } from './deploy/index.js';
import { rollback, type DeploymentContext } from './deploy/rollback.js';
import { sendProgress } from './progress.js';
import { writeResultFile } from './writeback.js';

/**
 * Top-level pipeline for one job.
 *
 * Pipeline stages (Phase 7 status):
 *   0  fetch DSL                       — real
 *   1  contract-freeze                 — real (deterministic)
 *   2  scaffold                        — real (no-op until templates land)
 *   3  prisma stage                    — STUB (Phase 8)
 *   4  nest entity stage               — STUB (Phase 8)
 *   5  react entity stage              — STUB (Phase 9)
 *   6  integration stage               — STUB (Phase 9)
 *   7  auth stage                      — STUB (Phase 10)
 *   8  post-processing (compose)       — real (deterministic; skipped if absent)
 *   9  validation                      — real
 *  10+ deploy (gitea/portainer/npm)    — real, only when validation passes
 *
 * When `EXPORTER_MOCK_GENERATOR=true`, stages 1-9 are bypassed and the bundled
 * mock-project is materialized instead, preserving the Phase 5 fallback path.
 */
export async function runJob(jobId: string, dslPath: string): Promise<void> {
  console.log(`\n[${jobId}] runJob start path=${dslPath}`);
  const slug = generateSlug(jobId);
  const ctx: DeploymentContext = {};

  try {
    await sendProgress(jobId, 'started', `Job accepted (slug=${slug})`);

    const localDir = config.EXPORTER_MOCK_GENERATOR
      ? await runMockGenerator(jobId, slug)
      : await runRealGenerator(jobId, slug, dslPath);

    const result = await deployProject(jobId, slug, localDir, ctx);

    await sendProgress(jobId, 'processing', `[writeback] Saving deploy metadata`);
    const deployMdPath = replaceExt(dslPath, '.deploy.md');
    await writeResultFile(deployMdPath, renderDeployMd(slug, result));

    await sendProgress(jobId, 'completed', `Deployed: ${result.url}`);
    console.log(`[${jobId}] completed url=${result.url}`);
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[${jobId}] FAILED: ${message}`);
    await sendProgress(jobId, 'processing', `[rollback] Cleaning up partial state`);
    await rollback(ctx);
    await sendProgress(jobId, 'failed', message);
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
      `[scaffold] No scaffold templates present yet (Phase 6.5 TODO)`,
    );
  } else {
    await sendProgress(jobId, 'processing', `[scaffold] Copied ${scaffold.copied.length} files`);
  }

  // Stages 3-7 — LLM stubs
  await runLlmStage(jobId, 'prisma', workingDir, contract, runPrismaStage);
  await runLlmStage(jobId, 'nest-entities', workingDir, contract, (c) =>
    runNestEntityStage(c, {
      onProgress: (msg) => sendProgress(jobId, 'processing', `[nest-entities] ${msg}`),
    }),
  );
  await runLlmStage(jobId, 'react-entities', workingDir, contract, (c) =>
    runReactEntityStage(c, {
      onProgress: (msg) => sendProgress(jobId, 'processing', `[react-entities] ${msg}`),
    }),
  );
  await runLlmStage(jobId, 'integration', workingDir, contract, runIntegrationStage);
  await runLlmStage(jobId, 'auth', workingDir, contract, runAuthStage);

  // Stage 8 — post-processing
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

async function runLlmStage(
  jobId: string,
  name: string,
  workingDir: string,
  contract: FrozenContract,
  stage: (c: FrozenContract) => Promise<StageResult>,
): Promise<void> {
  await sendProgress(jobId, 'processing', `[${name}] Running stage`);
  const result = await runStage(jobId, name, () => stage(contract));
  await writeStageFiles(workingDir, result.files);
  await sendProgress(jobId, 'processing', `[${name}] Wrote ${result.files.length} files`);
}

async function writeStageFiles(workingDir: string, files: FileEntry[]): Promise<void> {
  for (const file of files) {
    const target = path.join(workingDir, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, 'utf8');
  }
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
