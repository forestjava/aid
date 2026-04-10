import { deleteRepo } from '../gitea/client.js';
import { deleteStack } from '../portainer/stack.js';
import { deleteProxyHost } from '../npm/proxy.js';

export interface DeploymentContext {
  jobId: string;
  slug: string;
  giteaRepo?: { owner: string; name: string };
  portainerStackId?: number;
  npmProxyHostId?: number;
  cleanupLog: string[];
}

/**
 * Best-effort cleanup of any resources created so far. Each step runs in its
 * own try/catch — failures are pushed onto `ctx.cleanupLog` but never rethrown,
 * so callers can chain rollback() in a catch block right before propagating
 * the original error.
 *
 * Reverse order: NPM → Portainer → Gitea.
 *
 * Idempotency: each underlying delete treats HTTP 404 as success, so calling
 * rollback() twice on the same context is safe — the second pass simply logs
 * "already deleted" entries instead of throwing.
 */
export async function rollback(ctx: DeploymentContext): Promise<void> {
  const tag = `[${ctx.jobId}][rollback]`;
  console.log(`${tag} Starting rollback for slug=${ctx.slug}`);

  // 1. NPM proxy host
  if (ctx.npmProxyHostId !== undefined) {
    const id = ctx.npmProxyHostId;
    try {
      await deleteProxyHost(id);
      const line = `NPM proxy host ${id} deleted`;
      ctx.cleanupLog.push(line);
      console.log(`${tag} ${line}`);
    } catch (err) {
      const line = `NPM cleanup failed (id=${id}): ${(err as Error).message}`;
      ctx.cleanupLog.push(line);
      console.error(`${tag} ${line}`);
    } finally {
      // Mark as handled so a repeat rollback() is a no-op for this resource.
      ctx.npmProxyHostId = undefined;
    }
  } else {
    ctx.cleanupLog.push('NPM proxy host: nothing to clean up');
  }

  // 2. Portainer stack
  if (ctx.portainerStackId !== undefined) {
    const id = ctx.portainerStackId;
    try {
      await deleteStack(id);
      const line = `Portainer stack ${id} deleted`;
      ctx.cleanupLog.push(line);
      console.log(`${tag} ${line}`);
    } catch (err) {
      const line = `Portainer cleanup failed (id=${id}): ${(err as Error).message}`;
      ctx.cleanupLog.push(line);
      console.error(`${tag} ${line}`);
    } finally {
      ctx.portainerStackId = undefined;
    }
  } else {
    ctx.cleanupLog.push('Portainer stack: nothing to clean up');
  }

  // Small breather: Portainer can take a few seconds to fully release the
  // container name back to the daemon. Not strictly required for cleanup
  // success, but avoids confusing "name in use" errors on immediate retry.
  if (ctx.giteaRepo) {
    await sleep(1_000);
  }

  // 3. Gitea repo
  if (ctx.giteaRepo) {
    const { owner, name } = ctx.giteaRepo;
    try {
      await deleteRepo(owner, name);
      const line = `Gitea repo ${owner}/${name} deleted`;
      ctx.cleanupLog.push(line);
      console.log(`${tag} ${line}`);
    } catch (err) {
      const line = `Gitea cleanup failed (${owner}/${name}): ${(err as Error).message}`;
      ctx.cleanupLog.push(line);
      console.error(`${tag} ${line}`);
    } finally {
      ctx.giteaRepo = undefined;
    }
  } else {
    ctx.cleanupLog.push('Gitea repo: nothing to clean up');
  }

  console.log(`${tag} Rollback complete (${ctx.cleanupLog.length} entries)`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
