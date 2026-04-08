import { config } from '../config.js';
import { createRepo } from '../gitea/client.js';
import { pushDirectory } from '../gitea/push.js';
import { createStackFromRepo, waitUntilRunning } from '../portainer/stack.js';
import { createProxyHost } from '../npm/proxy.js';
import { sendProgress } from '../progress.js';
import type { DeploymentContext } from './rollback.js';

export interface DeployResult {
  url: string;
  domain: string;
  giteaRepoUrl: string;
  stackId: number;
  proxyHostId: number;
}

/**
 * Runs the full Gitea → Portainer → NPM deployment for an already-materialized
 * working directory. Mutates `ctx` after each successful step so the caller can
 * roll back partial state on failure.
 */
export async function deployProject(
  jobId: string,
  slug: string,
  localDir: string,
  ctx: DeploymentContext,
): Promise<DeployResult> {
  const owner = config.GITEA_USERNAME!;
  const repoName = slug;
  const containerName = `${slug}-client`;
  const domain = `${slug}.${config.PUBLIC_DOMAIN_SUFFIX}`;
  const giteaRepoUrl = `${config.GITEA_BASE_URL}/${owner}/${repoName}.git`;

  // 1. Gitea repo
  await sendProgress(jobId, 'processing', `[gitea] Creating repo ${owner}/${repoName}`);
  await createRepo(repoName);
  ctx.giteaRepo = { owner, name: repoName };

  // 2. Push generated project
  await sendProgress(jobId, 'processing', `[gitea] Pushing project to ${owner}/${repoName}`);
  await pushDirectory(localDir, owner, repoName);

  // 3. Portainer stack from repo
  await sendProgress(jobId, 'processing', `[portainer] Creating stack "${slug}"`);
  const stackId = await createStackFromRepo({
    name: slug,
    repoUrl: giteaRepoUrl,
    gitToken: config.GITEA_TOKEN!,
    gitUsername: owner,
  });
  ctx.portainerStackId = stackId;

  // 4. Wait for stack to be running
  await sendProgress(jobId, 'processing', `[portainer] Waiting for stack ${stackId} to start`);
  await waitUntilRunning(stackId);

  // 5. NPM proxy host
  await sendProgress(jobId, 'processing', `[npm] Creating proxy host for ${domain}`);
  const { id: proxyHostId } = await createProxyHost({
    domain,
    forwardHost: containerName,
    forwardPort: 80,
  });
  ctx.npmProxyHostId = proxyHostId;

  return {
    url: `https://${domain}`,
    domain,
    giteaRepoUrl: `${config.GITEA_BASE_URL}/${owner}/${repoName}`,
    stackId,
    proxyHostId,
  };
}
