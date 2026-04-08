import path from 'node:path';
import { generateSlug } from './deploy/slug.js';
import { materializeMockProject } from './generator/materialize.js';
import { deployProject, type DeployResult } from './deploy/index.js';
import { rollback, type DeploymentContext } from './deploy/rollback.js';
import { sendProgress } from './progress.js';
import { writeResultFile } from './writeback.js';

/**
 * Top-level pipeline for one job. Phase 5: mock project only — no LLM, no
 * generator stages. Stages: materialize → gitea → portainer → npm → writeback.
 *
 * On any failure, partial state is rolled back (best-effort) and the job is
 * marked as failed.
 */
export async function runJob(jobId: string, dslPath: string): Promise<void> {
  console.log(`\n[${jobId}] runJob start path=${dslPath}`);
  const slug = generateSlug(jobId);
  const ctx: DeploymentContext = {};

  try {
    await sendProgress(jobId, 'started', `Job accepted (slug=${slug})`);

    await sendProgress(jobId, 'processing', `[materialize] Copying mock project (slug=${slug})`);
    const localDir = await materializeMockProject(jobId, slug);

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
