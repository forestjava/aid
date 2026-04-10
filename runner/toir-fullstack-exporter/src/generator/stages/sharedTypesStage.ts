import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { FrozenContract, FrozenEndpoint } from '../contractFreeze.js';
import { callLLM } from '../llmClient.js';
import { appendRepairFeedback, type StageInput } from '../repair.js';
import { parseLlmFiles } from './fileParser.js';
import type { FileEntry, StageResult } from './types.js';

const SYSTEM_PROMPT_PATH = fileURLToPath(
  new URL('../../../context/prompts/shared-types-rules.md', import.meta.url),
);

const ALLOWED_PREFIXES = ['server/src/enums/', 'server/src/shared/'] as const;

/**
 * Convert PascalCase (or consecutive-caps) enum names to kebab-case filenames
 * without pluralization. Used for `server/src/enums/<name>.enum.ts`.
 *
 * Examples:
 *   EquipmentStatus → equipment-status
 *   HTTPStatus      → http-status
 *   status          → status
 */
export function enumFileName(enumName: string): string {
  return enumName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function isListEndpoint(ep: FrozenEndpoint): boolean {
  // Heuristic: name starts with `list`, OR path contains `/page` (DSL
  // convention in toir.api.dsl), OR method is GET without a path param.
  if (ep.name.toLowerCase().startsWith('list')) return true;
  if (ep.path && ep.path.includes('/page')) return true;
  return false;
}

/**
 * Deterministic user prompt for the shared-types stage. Consumes only a
 * `FrozenContract` and emits a self-contained instruction block that lists
 * the required output files, a JSON projection of the contract (enums + list
 * endpoints), and the strict response format contract.
 *
 * The system prompt (in `context/prompts/shared-types-rules.md`) carries the
 * durable rules; this user prompt carries the job-specific data.
 */
export function buildSharedTypesUserPrompt(contract: FrozenContract): string {
  const listEndpoints = contract.endpoints.filter(isListEndpoint).map((ep) => ({
    apiName: ep.apiName,
    name: ep.name,
    method: ep.method,
    path: ep.path,
  }));

  const requiredOutputs: string[] = [];
  for (const e of contract.enums) {
    requiredOutputs.push(`- server/src/enums/${enumFileName(e.name)}.enum.ts — exports enum ${e.name}`);
  }
  requiredOutputs.push('- server/src/shared/pagination.ts — exports PaginatedResponse<T> and ListQueryParams');
  requiredOutputs.push('- server/src/shared/index.ts — barrel re-exporting pagination');

  const projection = {
    enums: contract.enums,
    listEndpoints,
  };

  return [
    'Generate the shared TypeScript types consumed by all per-entity NestJS modules.',
    '',
    'Follow the system prompt exactly. The required output files for THIS job are:',
    '',
    ...requiredOutputs,
    '',
    '## Contract projection (JSON)',
    '',
    'Use this projection as the authoritative source for enum names, enum values,',
    'and the list endpoints that will consume the pagination types.',
    '',
    '```json',
    JSON.stringify(projection, null, 2),
    '```',
    '',
    '## Strict response format',
    '',
    'Respond with a single JSON object only, no prose:',
    '',
    '```json',
    '{"files":[{"path":"server/src/enums/<kebab>.enum.ts","content":"..."}]}',
    '```',
    '',
    'All file paths MUST start with `server/src/enums/` or `server/src/shared/`.',
    'Do NOT generate DTOs, modules, Prisma schema, or any other file — those are',
    'owned by other stages and will be dropped if returned here.',
  ].join('\n');
}

/**
 * Shared-types LLM stage. Runs once per job between `prisma` and
 * `nest-entities`, emits enum files and pagination generics, and throws if
 * the LLM returns zero in-zone files. Files outside the two allowed prefixes
 * are dropped with a warning.
 */
export async function runSharedTypesStage(input: StageInput): Promise<StageResult> {
  const { contract, previousError } = input;

  const systemPrompt = await fs.readFile(SYSTEM_PROMPT_PATH, 'utf8');
  const userPrompt = appendRepairFeedback(buildSharedTypesUserPrompt(contract), previousError);

  const { content } = await callLLM({
    systemPrompt,
    userPrompt,
    maxTokens: 4000,
    temperature: 0.2,
    label: 'shared-types',
  });

  const parsed = parseLlmFiles(content);

  const kept: FileEntry[] = [];
  const dropped: FileEntry[] = [];
  for (const f of parsed) {
    if (ALLOWED_PREFIXES.some((p) => f.path.startsWith(p))) {
      kept.push(f);
    } else {
      dropped.push(f);
    }
  }

  for (const d of dropped) {
    console.warn(
      `[shared-types] WARN dropped out-of-zone file "${d.path}" ` +
        `(allowed prefixes: ${ALLOWED_PREFIXES.join(', ')})`,
    );
  }

  if (kept.length === 0) {
    const droppedPaths = dropped.map((d) => d.path).join(', ') || '<none>';
    throw new Error(
      `shared-types: no in-zone files returned (raw count=${parsed.length}); dropped paths: ${droppedPaths}`,
    );
  }

  // Warn (but do not throw) if the LLM returned a partial result that omits
  // a file we expected from this contract. The downstream `ts-build` sweep
  // will catch the consequence as a compile error and trigger a repair pass,
  // but flagging the omission directly makes the root cause obvious in logs.
  const keptPaths = new Set(kept.map((f) => f.path));
  const expectedPaths = expectedFilePaths(contract);
  for (const expected of expectedPaths) {
    if (!keptPaths.has(expected)) {
      console.warn(
        `[shared-types] WARN expected file "${expected}" was not generated`,
      );
    }
  }

  return { files: kept };
}

function expectedFilePaths(contract: { enums: { name: string }[] }): string[] {
  const paths: string[] = [];
  for (const e of contract.enums) {
    paths.push(`server/src/enums/${enumFileName(e.name)}.enum.ts`);
  }
  paths.push('server/src/shared/pagination.ts');
  paths.push('server/src/shared/index.ts');
  return paths;
}
