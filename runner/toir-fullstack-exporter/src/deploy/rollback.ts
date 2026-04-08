import { deleteRepo } from '../gitea/client.js';
import { deleteStack } from '../portainer/stack.js';
import { deleteProxyHost } from '../npm/proxy.js';

export interface DeploymentContext {
  giteaRepo?: { owner: string; name: string };
  portainerStackId?: number;
  npmProxyHostId?: number;
}

/**
 * Best-effort cleanup of any resources created so far. Each step runs in its
 * own try/catch — failures are logged but never rethrown, so callers can chain
 * rollback() right before propagating the original error.
 *
 * Reverse order: NPM → Portainer → Gitea.
 */
export async function rollback(ctx: DeploymentContext): Promise<void> {
  if (ctx.npmProxyHostId !== undefined) {
    try {
      await deleteProxyHost(ctx.npmProxyHostId);
    } catch (err) {
      console.error(`[rollback] NPM proxy host delete failed: ${(err as Error).message}`);
    }
  }

  if (ctx.portainerStackId !== undefined) {
    try {
      await deleteStack(ctx.portainerStackId);
    } catch (err) {
      console.error(`[rollback] Portainer stack delete failed: ${(err as Error).message}`);
    }
  }

  if (ctx.giteaRepo) {
    try {
      await deleteRepo(ctx.giteaRepo.owner, ctx.giteaRepo.name);
    } catch (err) {
      console.error(`[rollback] Gitea repo delete failed: ${(err as Error).message}`);
    }
  }
}
