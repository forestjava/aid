import type { FrozenContract } from '../contractFreeze.js';
import type { StageResult } from './types.js';

/**
 * Phase 7 stub. Real implementation will fan out per entity and call the LLM
 * with backend-rules.md to produce `server/src/modules/<entity>/`.
 */
export async function runNestEntityStage(_contract: FrozenContract): Promise<StageResult> {
  return { files: [] };
}
