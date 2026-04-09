import type { FrozenContract, FrozenEndpoint } from '../contractFreeze.js';

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
