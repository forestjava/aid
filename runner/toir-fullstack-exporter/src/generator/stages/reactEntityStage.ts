import type { FrozenContract } from '../contractFreeze.js';
import type { StageResult } from './types.js';

/**
 * Phase 7 stub. Real implementation will fan out per entity and call the LLM
 * with frontend-rules.md to produce `client/src/resources/<entity>/`.
 */
export async function runReactEntityStage(_contract: FrozenContract): Promise<StageResult> {
  return { files: [] };
}
