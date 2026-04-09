import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTsBuildCheck, type TsBuildCheckDeps } from './tsBuildCheck.js';
import type { TsCheckResult } from './tsCheck.js';

function okResult(): TsCheckResult {
  return { ok: true, exitCode: 0, stdout: '', stderr: '' };
}

function tscFailure(stdout: string): TsCheckResult {
  return { ok: false, exitCode: 1, stdout, stderr: '' };
}

function infraFailure(msg: string): TsCheckResult {
  return { ok: false, exitCode: 1, stdout: '', stderr: '', error: msg };
}

describe('runTsBuildCheck', () => {
  let deps: TsBuildCheckDeps;
  let tsCheck: ReturnType<typeof vi.fn>;
  let rerunStages: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tsCheck = vi.fn();
    rerunStages = vi.fn().mockResolvedValue(undefined);
    log = vi.fn().mockResolvedValue(undefined);
    deps = { tsCheck, rerunStages, log };
  });

  it('returns without repair when the first check passes', async () => {
    tsCheck.mockResolvedValueOnce(okResult());

    await runTsBuildCheck('/tmp/work', deps);

    expect(tsCheck).toHaveBeenCalledTimes(1);
    expect(rerunStages).not.toHaveBeenCalled();
  });

  it('runs the repair sweep when the first check reports tsc errors', async () => {
    tsCheck
      .mockResolvedValueOnce(tscFailure('src/modules/x.ts(1,1): error TS2322: ...'))
      .mockResolvedValueOnce(okResult());

    await runTsBuildCheck('/tmp/work', deps);

    expect(rerunStages).toHaveBeenCalledOnce();
    expect(tsCheck).toHaveBeenCalledTimes(2);
  });

  it('passes the TS error text as repair feedback to rerunStages', async () => {
    const errors = 'src/modules/x.ts(1,1): error TS2322: Type mismatch';
    tsCheck.mockResolvedValueOnce(tscFailure(errors)).mockResolvedValueOnce(okResult());

    await runTsBuildCheck('/tmp/work', deps);

    const feedback = rerunStages.mock.calls[0][0] as string;
    expect(feedback).toContain('TypeScript compilation failed');
    expect(feedback).toContain(errors);
  });

  it('throws with full TS output when the second check still fails', async () => {
    tsCheck
      .mockResolvedValueOnce(tscFailure('first round of errors'))
      .mockResolvedValueOnce(tscFailure('second round of errors'));

    const err = await runTsBuildCheck('/tmp/work', deps).catch((e: Error) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/build failed after repair/);
    expect((err as Error).message).toContain('second round of errors');
  });

  it('surfaces infra errors that appear only after the repair sweep', async () => {
    tsCheck
      .mockResolvedValueOnce(tscFailure('first round'))
      .mockResolvedValueOnce(infraFailure('npm install failed: broken lockfile'));

    await expect(runTsBuildCheck('/tmp/work', deps)).rejects.toThrow(/npm install failed/);
  });

  it('short-circuits on infra errors (npm install) without running the repair sweep', async () => {
    tsCheck.mockResolvedValueOnce(infraFailure('npm install failed: ENOENT'));

    await expect(runTsBuildCheck('/tmp/work', deps)).rejects.toThrow(/npm install failed/);

    expect(rerunStages).not.toHaveBeenCalled();
    expect(tsCheck).toHaveBeenCalledTimes(1);
  });

  it('short-circuits on infra errors (prisma generate)', async () => {
    tsCheck.mockResolvedValueOnce(infraFailure('prisma generate failed: schema invalid'));

    await expect(runTsBuildCheck('/tmp/work', deps)).rejects.toThrow(/prisma generate failed/);

    expect(rerunStages).not.toHaveBeenCalled();
  });
});
