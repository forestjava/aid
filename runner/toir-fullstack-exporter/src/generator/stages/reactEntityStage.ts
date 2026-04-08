import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { FrozenContract } from '../contractFreeze.js';
import { pLimit } from '../concurrency.js';
import { sliceContractForEntity, entityKebab, type EntitySlice } from '../entitySlice.js';
import { callLLM } from '../llmClient.js';
import { parseLlmFiles, filterByPrefix } from './fileParser.js';
import type { FileEntry, StageResult } from './types.js';

const FRONTEND_RULES_PATH = fileURLToPath(
  new URL('../../../context/prompts/frontend-rules.md', import.meta.url),
);

export interface ReactEntityStageOptions {
  /** Optional progress callback used by the orchestrator for per-entity events. */
  onProgress?: (message: string) => void | Promise<void>;
}

/**
 * Phase 9 — Stage 5. Mirror image of `runNestEntityStage` for React Admin
 * resource components. Calls the LLM with `frontend-rules.md` and an
 * entity-scoped slice, then keeps only files under
 * `client/src/resources/<entityKebab>/`. App.tsx, dataProvider, and auth
 * files are out of zone and dropped (they belong to Phase 10).
 */
export async function runReactEntityStage(
  contract: FrozenContract,
  options: ReactEntityStageOptions = {},
): Promise<StageResult> {
  const systemPrompt = await fs.readFile(FRONTEND_RULES_PATH, 'utf8');
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
        const allowedPrefix = `client/src/resources/${kebab}/`;

        if (options.onProgress) {
          await options.onProgress(`Generating React Admin resource: ${entity.name}`);
        }

        try {
          const userPrompt = buildReactUserPrompt(slice, kebab, allowedPrefix);
          const { content } = await callLLM({
            systemPrompt,
            userPrompt,
            maxTokens: 12000,
            temperature: 0.2,
            label: `react:${kebab}`,
          });

          const parsed = parseLlmFiles(content);
          const { kept, dropped } = filterByPrefix(parsed, allowedPrefix);

          for (const d of dropped) {
            console.warn(
              `[react:${kebab}] WARN dropped out-of-zone file "${d.path}" (allowed prefix: ${allowedPrefix})`,
            );
          }

          if (kept.length === 0) {
            throw new Error(`no in-zone files returned (raw count=${parsed.length})`);
          }

          allFiles.push(...kept);
        } catch (err) {
          const msg = (err as Error).message;
          console.error(`[react:${kebab}] FAILED: ${msg}`);
          failed.push(entity.name);
        } finally {
          done++;
          if (options.onProgress) {
            await options.onProgress(`React entities: ${done} / ${total} done`);
          }
        }
      }),
    ),
  );

  if (total > 0 && failed.length * 2 > total) {
    throw new Error(
      `react entity stage: ${failed.length}/${total} entities failed (${failed.join(', ')})`,
    );
  }

  return { files: allFiles };
}

function buildReactUserPrompt(slice: EntitySlice, kebab: string, allowedPrefix: string): string {
  const entity = slice.entity.name;
  return [
    `Generate the complete React Admin resource for entity \`${entity}\`.`,
    '',
    'Follow the rules in the system prompt exactly. The expected files are:',
    `- ${allowedPrefix}${entity}List.tsx`,
    `- ${allowedPrefix}${entity}Create.tsx`,
    `- ${allowedPrefix}${entity}Edit.tsx`,
    `- ${allowedPrefix}${entity}Show.tsx`,
    '',
    'Strict response format — respond with a single JSON object only:',
    '',
    '```json',
    '{"files":[{"path":"client/src/resources/<kebab>/...","content":"<file contents>"}]}',
    '```',
    '',
    `All file paths MUST start with \`${allowedPrefix}\`. Do NOT generate \`App.tsx\`,`,
    '`dataProvider.ts`, auth files, or any other shared seam — those are owned by',
    'other stages and will be dropped if returned here.',
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
