/**
 * TTL cleanup utility for gen-* resources across Gitea, Portainer, and NPM.
 *
 * Run with:
 *   npm run cleanup
 *
 * In Docker:
 *   docker exec aid-runner-toir-fullstack-exporter npm run cleanup
 *
 * Schedule daily in Portainer:
 *   1. Portainer → Settings → Edge Compute → Edge Jobs → Add Edge Job
 *      (or use a host crontab entry on the Docker host)
 *   2. Cron expression: `0 3 * * *`  (03:00 UTC daily)
 *   3. Command: `docker exec aid-runner-toir-fullstack-exporter npm run cleanup`
 *
 * Alternative (host crontab):
 *   0 3 * * * docker exec aid-runner-toir-fullstack-exporter npm run cleanup >> /var/log/toir-cleanup.log 2>&1
 *
 * Behavior:
 * - Resources matching `^gen-(\d{8})-[a-f0-9]{8}$` and older than CLEANUP_TTL_DAYS
 *   (default 7) are deleted in dependency order: NPM → Portainer → Gitea.
 * - Resources NOT matching that pattern are never touched.
 * - Failures during individual deletes are logged but do not abort the run.
 * - Exit code 0 if every expired resource was either deleted or none existed.
 *   Non-zero only on systemic failures (scan failure for a whole service or any
 *   delete failure).
 */

import 'dotenv/config';
import { config } from '../config.js';
import { deleteRepo } from '../gitea/client.js';
import { deleteStack } from '../portainer/stack.js';
import { deleteProxyHost } from '../npm/proxy.js';
import {
  listExpiredGiteaRepos,
  listExpiredPortainerStacks,
  listExpiredNpmProxyHosts,
  type ExpiredGiteaRepo,
  type ExpiredPortainerStack,
  type ExpiredNpmProxyHost,
} from './scanner.js';

interface Tally {
  found: number;
  deleted: number;
  failed: number;
}

function newTally(): Tally {
  return { found: 0, deleted: 0, failed: 0 };
}

function addTally(a: Tally, b: Tally): Tally {
  return {
    found: a.found + b.found,
    deleted: a.deleted + b.deleted,
    failed: a.failed + b.failed,
  };
}

async function scanSafely<T>(
  label: string,
  fn: () => Promise<T[]>,
): Promise<{ items: T[]; scanFailed: boolean }> {
  try {
    const items = await fn();
    return { items, scanFailed: false };
  } catch (err) {
    console.error(`[cleanup] Failed to scan ${label}:`, (err as Error).message);
    return { items: [], scanFailed: true };
  }
}

async function cleanupNpm(ttlDays: number): Promise<{ tally: Tally; scanFailed: boolean }> {
  const tally = newTally();
  const { items, scanFailed } = await scanSafely<ExpiredNpmProxyHost>(
    'NPM proxy hosts',
    () => listExpiredNpmProxyHosts(ttlDays),
  );
  tally.found = items.length;

  console.log(`[cleanup] NPM: found ${items.length} expired proxy host(s)`);
  for (const host of items) {
    console.log(
      `[expired] npm-proxy-host ${host.domain} (created ${host.dateStr}, age ${host.ageDays} days)`,
    );
    try {
      await deleteProxyHost(host.id);
      console.log(`[cleanup] deleted npm-proxy-host ${host.domain} (id=${host.id})`);
      tally.deleted++;
    } catch (err) {
      console.error(
        `[cleanup] FAILED to delete npm-proxy-host ${host.domain} (id=${host.id}):`,
        (err as Error).message,
      );
      tally.failed++;
    }
  }

  return { tally, scanFailed };
}

async function cleanupPortainer(ttlDays: number): Promise<{ tally: Tally; scanFailed: boolean }> {
  const tally = newTally();
  const { items, scanFailed } = await scanSafely<ExpiredPortainerStack>(
    'Portainer stacks',
    () => listExpiredPortainerStacks(ttlDays),
  );
  tally.found = items.length;

  console.log(`[cleanup] Portainer: found ${items.length} expired stack(s)`);
  for (const stack of items) {
    console.log(
      `[expired] portainer-stack ${stack.name} (created ${stack.dateStr}, age ${stack.ageDays} days)`,
    );
    try {
      await deleteStack(stack.id);
      console.log(`[cleanup] deleted portainer-stack ${stack.name} (id=${stack.id})`);
      tally.deleted++;
    } catch (err) {
      console.error(
        `[cleanup] FAILED to delete portainer-stack ${stack.name} (id=${stack.id}):`,
        (err as Error).message,
      );
      tally.failed++;
    }
  }

  return { tally, scanFailed };
}

async function cleanupGitea(ttlDays: number): Promise<{ tally: Tally; scanFailed: boolean }> {
  const tally = newTally();
  const { items, scanFailed } = await scanSafely<ExpiredGiteaRepo>(
    'Gitea repos',
    () => listExpiredGiteaRepos(ttlDays),
  );
  tally.found = items.length;

  console.log(`[cleanup] Gitea: found ${items.length} expired repo(s)`);
  for (const repo of items) {
    console.log(
      `[expired] gitea-repo ${repo.owner}/${repo.name} (created ${repo.dateStr}, age ${repo.ageDays} days)`,
    );
    try {
      await deleteRepo(repo.owner, repo.name);
      console.log(`[cleanup] deleted gitea-repo ${repo.owner}/${repo.name}`);
      tally.deleted++;
    } catch (err) {
      console.error(
        `[cleanup] FAILED to delete gitea-repo ${repo.owner}/${repo.name}:`,
        (err as Error).message,
      );
      tally.failed++;
    }
  }

  return { tally, scanFailed };
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const ttlDays = config.CLEANUP_TTL_DAYS;

  console.log(`[cleanup] === START === ${startedAt.toISOString()}`);
  console.log(`[cleanup] TTL: ${ttlDays} day(s)`);
  console.log(
    `[cleanup] Cutoff: resources with embedded date < ${new Date(
      Date.now() - ttlDays * 86_400_000,
    )
      .toISOString()
      .slice(0, 10)} are expired`,
  );

  // Reverse dependency order: NPM → Portainer → Gitea
  const npmResult = await cleanupNpm(ttlDays);
  const portainerResult = await cleanupPortainer(ttlDays);
  const giteaResult = await cleanupGitea(ttlDays);

  const total = addTally(addTally(npmResult.tally, portainerResult.tally), giteaResult.tally);
  const anyScanFailed =
    npmResult.scanFailed || portainerResult.scanFailed || giteaResult.scanFailed;

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  console.log('');
  console.log('[cleanup] ====== SUMMARY ======');
  console.log(`[cleanup] NPM:       found ${npmResult.tally.found}, deleted ${npmResult.tally.deleted}, failed ${npmResult.tally.failed}`);
  console.log(`[cleanup] Portainer: found ${portainerResult.tally.found}, deleted ${portainerResult.tally.deleted}, failed ${portainerResult.tally.failed}`);
  console.log(`[cleanup] Gitea:     found ${giteaResult.tally.found}, deleted ${giteaResult.tally.deleted}, failed ${giteaResult.tally.failed}`);
  console.log(`[cleanup] TOTAL:     Found ${total.found} expired resources, deleted ${total.deleted}, failed ${total.failed}`);
  if (anyScanFailed) {
    console.log('[cleanup] WARNING: one or more service scans failed — counts may be incomplete');
  }
  console.log(`[cleanup] === END === ${finishedAt.toISOString()} (${durationMs}ms)`);

  // Non-zero only on systemic failures: scan failure or any delete failure
  const exitCode = anyScanFailed || total.failed > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[cleanup] Fatal error:', err);
  process.exit(2);
});
