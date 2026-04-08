import type { FrozenContract } from '../contractFreeze.js';
import type { StageResult } from './types.js';

/**
 * Phase 7 stub. Real implementation wires `server/src/app.module.ts` and
 * `client/src/App.tsx` registrations from the frozen contract.
 */
export async function runIntegrationStage(_contract: FrozenContract): Promise<StageResult> {
  return { files: [] };
}
