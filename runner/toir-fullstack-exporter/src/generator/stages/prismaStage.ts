import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FrozenContract } from '../contractFreeze.js';
import { callLLM, extractCodeBlock } from '../llmClient.js';
import type { StageResult } from './types.js';

const PRISMA_RULES_PATH = fileURLToPath(
  new URL('../../../context/prompts/prisma-rules.md', import.meta.url),
);

const SCHEMA_OUTPUT_PATH = 'server/prisma/schema.prisma';

/**
 * Phase 8: real LLM stage. Calls Claude (via OpenRouter) with prisma-rules.md
 * as the system prompt and the frozen contract as the user message, then
 * returns the generated schema.prisma.
 */
export async function runPrismaStage(contract: FrozenContract): Promise<StageResult> {
  const systemPrompt = await fs.readFile(PRISMA_RULES_PATH, 'utf8');

  const userPrompt =
    'Generate a complete server/prisma/schema.prisma for the following domain contract. ' +
    'Follow the rules in the system prompt exactly. Output only the schema (a fenced ' +
    '```prisma code block is acceptable); do not add explanations.\n\n' +
    '## Frozen contract (JSON)\n\n' +
    '```json\n' +
    JSON.stringify(contract, null, 2) +
    '\n```\n';

  const { content } = await callLLM({
    systemPrompt,
    userPrompt,
    maxTokens: 16000,
    temperature: 0.2,
    label: 'prisma',
  });

  const schema = extractCodeBlock(content, 'prisma');

  return {
    files: [
      {
        path: SCHEMA_OUTPUT_PATH,
        content: schema.endsWith('\n') ? schema : schema + '\n',
      },
    ],
  };
}
