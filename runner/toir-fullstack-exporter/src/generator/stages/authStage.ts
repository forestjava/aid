import type { FrozenContract } from '../contractFreeze.js';
import type { StageResult } from './types.js';

/**
 * Phase 7 stub. Real implementation produces the shared auth platform
 * skeleton from `prompts/auth-rules.md` (server/src/auth, client/src/auth,
 * dataProvider, realm artifact).
 */
export async function runAuthStage(_contract: FrozenContract): Promise<StageResult> {
  return { files: [] };
}
