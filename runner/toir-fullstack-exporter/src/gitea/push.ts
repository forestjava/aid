import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

interface ExecResult {
  stdout: string;
  stderr: string;
}

async function git(args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<ExecResult> {
  try {
    return await execFileAsync('git', args, {
      cwd: options?.cwd,
      env: options?.env ?? process.env,
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    // Never include remote URLs (which may contain tokens) in error messages
    const stderr = (e.stderr ?? '').replace(/https?:\/\/[^@]+@[^\s]+/g, '<redacted-url>');
    const stdout = (e.stdout ?? '').replace(/https?:\/\/[^@]+@[^\s]+/g, '<redacted-url>');
    throw new Error(`git ${args[0]} failed:\nstderr: ${stderr}\nstdout: ${stdout}`);
  }
}

/**
 * Initialises a git repo in localDir and pushes all files to
 * https://git.greact.ru/{owner}/{repo}.git
 *
 * The remote URL (with embedded token) is NEVER logged.
 */
export async function pushDirectory(localDir: string, owner: string, repo: string): Promise<void> {
  console.log(`[gitea] Pushing ${localDir} → ${owner}/${repo}`);

  const token = config.GITEA_TOKEN!;
  const host = config.GITEA_BASE_URL!.replace(/^https?:\/\//, '');
  // Token embedded here — must never appear in logs
  const remoteUrl = `https://${owner}:${token}@${host}/${owner}/${repo}.git`;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'toir-bot',
    GIT_AUTHOR_EMAIL: 'toir-bot@greact.ru',
    GIT_COMMITTER_NAME: 'toir-bot',
    GIT_COMMITTER_EMAIL: 'toir-bot@greact.ru',
  };

  const opts = { cwd: localDir, env };

  await git(['init', '-b', 'main'], opts);
  await git(['add', '-A'], opts);
  await git(['commit', '-m', 'Initial generated project'], opts);

  // Set remote without logging the URL
  await git(['remote', 'add', 'origin', remoteUrl], opts);
  console.log(`[gitea] Pushing to ${owner}/${repo} ...`);
  await git(['push', '-u', 'origin', 'main'], opts);

  console.log(`[gitea] Push complete: ${owner}/${repo}`);
}
