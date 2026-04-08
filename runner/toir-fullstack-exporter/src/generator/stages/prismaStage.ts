import type { FrozenContract } from '../contractFreeze.js';
import type { StageResult } from './types.js';

/**
 * Phase 7 stub. Real implementation will call the LLM with prisma-rules.md +
 * the frozen contract and return `server/prisma/schema.prisma`.
 */
export async function runPrismaStage(_contract: FrozenContract): Promise<StageResult> {
  return { files: [] };
}
