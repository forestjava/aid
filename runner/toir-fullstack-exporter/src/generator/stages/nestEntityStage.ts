import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { pLimit } from '../concurrency.js';
import { sliceContractForEntity, entityKebab, type EntitySlice } from '../entitySlice.js';
import { callLLM } from '../llmClient.js';
import { appendRepairFeedback, type StageInput } from '../repair.js';
import { parseLlmFiles, filterByPrefix } from './fileParser.js';
import type { FileEntry, StageResult } from './types.js';

const BACKEND_RULES_PATH = fileURLToPath(
  new URL('../../../context/prompts/backend-rules.md', import.meta.url),
);

/**
 * Phase 9 — Stage 4. For each entity in the contract, calls the LLM with
 * `backend-rules.md` as the system prompt and an entity-scoped slice as the
 * user prompt. Calls run in parallel bounded by `LLM_CONCURRENCY` (default 3).
 *
 * Each response is filtered to its allowed write zone
 * (`server/src/modules/<entityKebab>/`); files outside the zone are dropped
 * and logged. Per-entity failures are tolerated, but if more than half of all
 * entities fail the entire stage throws.
 */
export async function runNestEntityStage(input: StageInput): Promise<StageResult> {
  const { contract, previousError, onProgress } = input;
  const systemPrompt = await fs.readFile(BACKEND_RULES_PATH, 'utf8');
  const concurrency = parseInt(process.env.LLM_CONCURRENCY || '3', 10);
  const limit = pLimit(concurrency);

  const entities = contract.entities;
  const total = entities.length;
  let done = 0;
  const failed: string[] = [];
  const allFiles: FileEntry[] = [];

  await Promise.all(
    entities.map((entity) =>
      limit(async () => {
        const slice = sliceContractForEntity(contract, entity.name);
        const kebab = entityKebab(entity.name);
        const allowedPrefix = `server/src/modules/${kebab}/`;

        if (onProgress) {
          await onProgress(`Generating Nest module: ${entity.name}`);
        }

        try {
          const userPrompt = appendRepairFeedback(
            buildNestUserPrompt(slice, kebab, allowedPrefix),
            previousError,
          );
          const { content } = await callLLM({
            systemPrompt,
            userPrompt,
            maxTokens: 12000,
            temperature: 0.2,
            label: `nest:${kebab}`,
          });

          const parsed = parseLlmFiles(content);
          const { kept, dropped } = filterByPrefix(parsed, allowedPrefix);

          for (const d of dropped) {
            console.warn(
              `[nest:${kebab}] WARN dropped out-of-zone file "${d.path}" (allowed prefix: ${allowedPrefix})`,
            );
          }

          if (kept.length === 0) {
            throw new Error(`no in-zone files returned (raw count=${parsed.length})`);
          }

          allFiles.push(...kept);
        } catch (err) {
          const msg = (err as Error).message;
          console.error(`[nest:${kebab}] FAILED: ${msg}`);
          failed.push(entity.name);
        } finally {
          done++;
          if (onProgress) {
            await onProgress(`Nest entities: ${done} / ${total} done`);
          }
        }
      }),
    ),
  );

  if (total > 0 && failed.length * 2 > total) {
    throw new Error(
      `nest entity stage: ${failed.length}/${total} entities failed (${failed.join(', ')})`,
    );
  }

  return { files: allFiles };
}

function buildNestUserPrompt(slice: EntitySlice, kebab: string, allowedPrefix: string): string {
  return [
    `Generate the complete NestJS module for entity \`${slice.entity.name}\`.`,
    '',
    'Follow the rules in the system prompt exactly. The expected files are:',
    `- ${allowedPrefix}${kebab}.module.ts`,
    `- ${allowedPrefix}${kebab}.controller.ts`,
    `- ${allowedPrefix}${kebab}.service.ts`,
    `- ${allowedPrefix}dto/create-${kebab}.dto.ts`,
    `- ${allowedPrefix}dto/update-${kebab}.dto.ts`,
    '',
    'Strict response format — respond with a single JSON object only:',
    '',
    '```json',
    '{"files":[{"path":"server/src/modules/<kebab>/...","content":"<file contents>"}]}',
    '```',
    '',
    `All file paths MUST start with \`${allowedPrefix}\`. Do NOT generate \`app.module.ts\`,`,
    'auth files, Prisma schema, or any other shared/integration file — those are owned',
    'by other stages and will be dropped if returned here.',
    '',
    'Do NOT include explanations or prose outside the JSON object.',
    '',
    '## Entity slice (JSON)',
    '',
    '```json',
    JSON.stringify(slice, null, 2),
    '```',
  ].join('\n');
}
