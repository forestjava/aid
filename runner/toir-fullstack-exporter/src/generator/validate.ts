import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VALIDATOR = fileURLToPath(
  new URL('../../context/tools/validate-generation.mjs', import.meta.url),
);

export interface ValidateResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

/**
 * Runs `node tools/validate-generation.mjs --artifacts-only` against the
 * generated working directory and reports the outcome.
 */
export async function runValidator(workingDir: string): Promise<ValidateResult> {
  return new Promise((resolve) => {
    const child = spawn('node', [VALIDATOR, '--artifacts-only'], {
      cwd: workingDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr,
        error: err.message,
      });
    });

    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        exitCode: code,
        stdout,
        stderr,
      });
    });
  });
}
