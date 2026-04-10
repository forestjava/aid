import { spawn } from 'node:child_process';
import path from 'node:path';

export interface TsCheckResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

/**
 * Runs TypeScript compilation check against the generated server code.
 *
 * Steps:
 *   1. npm install (in workingDir/server) — installs dependencies so tsc and prisma are available
 *   2. npx prisma generate — generates Prisma client types needed by services
 *   3. npx tsc --noEmit — type-checks without producing output files
 *
 * Returns structured result with combined stdout/stderr so the orchestrator
 * can feed TypeScript errors back to the LLM as repair feedback.
 */
export async function runTsCheck(workingDir: string): Promise<TsCheckResult> {
  const serverDir = path.join(workingDir, 'server');

  const npmInstall = await runCommand('npm', ['install'], serverDir);
  if (!npmInstall.ok) {
    return {
      ...npmInstall,
      error: `npm install failed: ${npmInstall.stderr || npmInstall.stdout}`,
    };
  }

  const prismaGen = await runCommand('npx', ['prisma', 'generate'], serverDir);
  if (!prismaGen.ok) {
    return {
      ...prismaGen,
      error: `prisma generate failed: ${prismaGen.stderr || prismaGen.stdout}`,
    };
  }

  return runCommand('npx', ['tsc', '--noEmit'], serverDir);
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<TsCheckResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      resolve({ ok: false, exitCode: null, stdout, stderr, error: err.message });
    });

    child.on('close', (code) => {
      resolve({ ok: code === 0, exitCode: code, stdout, stderr });
    });
  });
}
