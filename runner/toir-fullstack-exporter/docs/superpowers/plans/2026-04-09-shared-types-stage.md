# Shared Types Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-pass LLM stage `shared-types` to the toir-fullstack-exporter runner that generates enum files and shared pagination types before `nest-entities` runs, and update the DTO typing rule so enum fields use real TypeScript enums instead of `string`. This eliminates the parallel-enum race and the `Type 'string' is not assignable to type 'EnumName'` errors that block Portainer Docker builds.

**Architecture:** New LLM stage `shared-types` slotted between `prisma` and `nest-entities`. Owns two file zones: `server/src/enums/` and `server/src/shared/`. One LLM call per job, reusing existing `runStageWithRepair` plumbing. `runTsBuildCheck` is extracted into its own module with dependency-injected `tsCheck` and `rerunStages` so it becomes unit-testable; its repair sweep order becomes `shared-types → nest-entities → integration`, and infra errors (npm install / prisma generate) now short-circuit the sweep.

**Tech Stack:** TypeScript (nodenext ESM), Node 22, vitest for tests (new), existing `callLLM` / `parseLlmFiles` / `filterByPrefix` / `appendRepairFeedback` helpers.

**Spec:** See `docs/superpowers/specs/2026-04-09-shared-types-stage-design.md`.

**Working directory for all paths:** `/Users/yyy/Desktop/create-runner-exporter/aid/runner/toir-fullstack-exporter/` (git root: `aid/`, so paths in commits are relative to `aid/`). All paths below are given relative to the runner project root unless explicitly stated.

---

## File Structure

**New files:**
- `vitest.config.ts` — vitest configuration
- `src/generator/repair.test.ts` — tests for `STAGE_ZONES` attribution
- `src/generator/stages/sharedTypesStage.ts` — new stage
- `src/generator/stages/sharedTypesStage.test.ts` — tests for the stage and its prompt builder
- `src/generator/tsBuildCheck.ts` — extracted, dependency-injected ts-build check
- `src/generator/tsBuildCheck.test.ts` — tests for repair sweep behavior and infra short-circuit
- `context/prompts/shared-types-rules.md` — system prompt for the new stage

**Modified files:**
- `package.json` — add `vitest` devDep and `test` script
- `src/generator/repair.ts` — add `'shared-types'` to `StageName`, add new `STAGE_ZONES` entry, remove enum pattern from `nest-entities`
- `src/generator/stages/nestEntityStage.ts` — remove dual-prefix filter, add "Available shared types" section to user prompt
- `src/orchestrator.ts` — import and call `runSharedTypesStage`, switch to `runTsBuildCheck` from its own module
- `context/prompts/backend-rules.md` — replace "Shared Enum Files" section, update DSL→TS enum mapping in rules

---

## Task 0: Bootstrap test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/__smoke__.test.ts` (temporary smoke test, deleted at end of task)

- [ ] **Step 0.1: Install vitest**

Run from the runner project root (`aid/runner/toir-fullstack-exporter/`):
```bash
npm install --save-dev vitest@^2.1.0
```

Expected: vitest added to `devDependencies` and `package-lock.json` updated. No build errors.

- [ ] **Step 0.2: Add `test` script to package.json**

Edit `package.json` scripts block. The final scripts object must look like:
```json
  "scripts": {
    "sync-context": "node scripts/sync-context.mjs",
    "prebuild": "node scripts/sync-context.mjs",
    "start": "tsx src/index.ts",
    "cleanup": "tsx src/cleanup/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 0.3: Create `vitest.config.ts`**

Full contents:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
  },
});
```

- [ ] **Step 0.4: Write a smoke test**

Create `src/__smoke__.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest bootstrap smoke', () => {
  it('can run a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 0.5: Run the smoke test**

Run: `npm test`
Expected output includes: `✓ src/__smoke__.test.ts` and `1 passed`. Exit code 0.

If the test fails with an ESM/loader error, check that `package.json` still has `"type": "module"` and that `vitest.config.ts` uses `defineConfig` import from `'vitest/config'` exactly.

- [ ] **Step 0.6: Delete the smoke test**

Delete `src/__smoke__.test.ts`. The file was scaffolding only.

- [ ] **Step 0.7: Commit**

```bash
git add runner/toir-fullstack-exporter/package.json \
        runner/toir-fullstack-exporter/package-lock.json \
        runner/toir-fullstack-exporter/vitest.config.ts
git commit -m "test: bootstrap vitest for the runner exporter

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 1: Update `STAGE_ZONES` in `repair.ts` (TDD)

**Files:**
- Create: `src/generator/repair.test.ts`
- Modify: `src/generator/repair.ts`

- [ ] **Step 1.1: Write the failing test**

Create `src/generator/repair.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { failuresForStage, parseValidatorFailures } from './repair.js';

describe('STAGE_ZONES attribution for shared-types', () => {
  it('attributes server/src/enums/*.ts failures to shared-types', () => {
    const failures = parseValidatorFailures(
      '- Missing file: server/src/enums/equipment-status.enum.ts\n',
    );
    const owned = failuresForStage(failures, 'shared-types');
    expect(owned).toHaveLength(1);
    expect(owned[0].files).toContain('server/src/enums/equipment-status.enum.ts');
  });

  it('attributes server/src/shared/*.ts failures to shared-types', () => {
    const failures = parseValidatorFailures(
      '- Missing file: server/src/shared/pagination.ts\n',
    );
    const owned = failuresForStage(failures, 'shared-types');
    expect(owned).toHaveLength(1);
  });

  it('does NOT attribute enum failures to nest-entities anymore', () => {
    const failures = parseValidatorFailures(
      '- Missing file: server/src/enums/equipment-status.enum.ts\n',
    );
    const owned = failuresForStage(failures, 'nest-entities');
    expect(owned).toHaveLength(0);
  });

  it('still attributes module failures to nest-entities', () => {
    const failures = parseValidatorFailures(
      '- Missing file: server/src/modules/equipment/equipment.module.ts\n',
    );
    const owned = failuresForStage(failures, 'nest-entities');
    expect(owned).toHaveLength(1);
  });
});
```

- [ ] **Step 1.2: Run the test and confirm it fails**

Run: `npm test -- repair.test`
Expected failure: the first test fails because `'shared-types'` is not a valid `StageName` (TypeScript error) OR runtime returns 0 owned failures because no STAGE_ZONES entry matches.

- [ ] **Step 1.3: Add `'shared-types'` to `StageName` union**

Edit `src/generator/repair.ts`. Find:
```ts
export type StageName =
  | 'prisma'
  | 'nest-entities'
  | 'react-entities'
  | 'integration'
  | 'auth';
```

Replace with:
```ts
export type StageName =
  | 'prisma'
  | 'shared-types'
  | 'nest-entities'
  | 'react-entities'
  | 'integration'
  | 'auth';
```

- [ ] **Step 1.4: Add the new `STAGE_ZONES` entry and remove the stale enum pattern from `nest-entities`**

In the same file, find:
```ts
const STAGE_ZONES: StageZone[] = [
  {
    stage: 'prisma',
    patterns: [/^server\/prisma\//],
  },
  {
    stage: 'nest-entities',
    patterns: [/^server\/src\/modules\//, /^server\/src\/enums\//],
  },
```

Replace with:
```ts
const STAGE_ZONES: StageZone[] = [
  {
    stage: 'prisma',
    patterns: [/^server\/prisma\//],
  },
  {
    stage: 'shared-types',
    patterns: [/^server\/src\/enums\//, /^server\/src\/shared\//],
  },
  {
    stage: 'nest-entities',
    patterns: [/^server\/src\/modules\//],
  },
```

- [ ] **Step 1.5: Run tests and confirm pass**

Run: `npm test -- repair.test`
Expected: all 4 tests pass.

- [ ] **Step 1.6: Commit**

```bash
git add runner/toir-fullstack-exporter/src/generator/repair.ts \
        runner/toir-fullstack-exporter/src/generator/repair.test.ts
git commit -m "feat(repair): add shared-types stage zone; own enums and shared

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Create `shared-types-rules.md` system prompt

**Files:**
- Create: `context/prompts/shared-types-rules.md`

- [ ] **Step 2.1: Create the prompt file**

Full contents:
```markdown
# Shared Types Generation Rules

You generate the shared TypeScript types consumed by all per-entity NestJS
modules in the runner-produced project. You run once per job, between the
Prisma schema stage and the per-entity NestJS stage.

## Write zones

You MAY write files under these two prefixes, and NOWHERE else:

- `server/src/enums/`
- `server/src/shared/`

Any file you emit outside these prefixes will be dropped by the runner.

## Required outputs

1. **One file per enum** in the frozen contract, at
   `server/src/enums/<kebab-name>.enum.ts`. Kebab-case is derived from the
   PascalCase enum name (e.g. `EquipmentStatus` → `equipment-status`).

   Each file exports a `string` TypeScript enum whose member names and values
   are identical to the DSL enum value names. Example:

   ```ts
   export enum EquipmentStatus {
     Active = 'Active',
     Repair = 'Repair',
     Reserve = 'Reserve',
     WriteOff = 'WriteOff',
   }
   ```

   String-valued enums are required. Do NOT emit numeric enums. Do NOT use
   `const enum`. Do NOT add helper functions, labels, descriptions, or
   metadata; the enum body is the only export.

2. **`server/src/shared/pagination.ts`** — pagination contract used by list
   endpoints and list service methods. Exact shape:

   ```ts
   export interface PaginatedResponse<T> {
     data: T[];
     total: number;
   }

   export interface ListQueryParams {
     _start?: string;
     _end?: string;
     _sort?: string;
     _order?: 'ASC' | 'DESC' | 'asc' | 'desc';
     q?: string;
     [key: string]: string | string[] | undefined;
   }
   ```

   `ListQueryParams` MUST include the string index signature — React Admin
   passes arbitrary filter params as query strings, and the per-entity
   services rely on that generic access pattern.

3. **`server/src/shared/index.ts`** — barrel file re-exporting pagination:

   ```ts
   export * from './pagination';
   ```

## Forbidden

- Do NOT emit DTOs, module files, Prisma schema, auth files, controllers, or
  services. Those belong to other stages and will be dropped.
- Do NOT import from `@nestjs/*`, `@prisma/client`, or any runtime package.
  Shared types are pure TypeScript with no runtime dependencies.
- Do NOT inline enum labels, descriptions, or i18n strings in the enum files.
- Do NOT emit `.d.ts` files. Use normal `.ts` files.

## Response format

Respond with a single JSON object and nothing else — no prose, no markdown
commentary, no leading or trailing text:

```json
{
  "files": [
    { "path": "server/src/enums/<kebab>.enum.ts", "content": "..." },
    { "path": "server/src/shared/pagination.ts", "content": "..." },
    { "path": "server/src/shared/index.ts", "content": "..." }
  ]
}
```

If you must return additional enum files, append them to the `files` array.
All paths MUST start with one of the two allowed prefixes.
```

- [ ] **Step 2.2: Commit**

```bash
git add runner/toir-fullstack-exporter/context/prompts/shared-types-rules.md
git commit -m "docs(prompts): add shared-types-rules.md system prompt

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Implement `buildSharedTypesUserPrompt` (TDD)

**Files:**
- Create: `src/generator/stages/sharedTypesStage.ts`
- Create: `src/generator/stages/sharedTypesStage.test.ts`

- [ ] **Step 3.1: Write failing tests for the pure prompt builder**

Create `src/generator/stages/sharedTypesStage.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildSharedTypesUserPrompt, enumFileName } from './sharedTypesStage.js';
import type { FrozenContract } from '../contractFreeze.js';

function makeContract(overrides: Partial<FrozenContract> = {}): FrozenContract {
  return {
    sourceFiles: [],
    entities: [],
    enums: [],
    dtos: [],
    endpoints: [],
    ...overrides,
  };
}

describe('enumFileName', () => {
  it('kebab-cases a single PascalCase word', () => {
    expect(enumFileName('EquipmentStatus')).toBe('equipment-status');
  });

  it('handles already-lowercase names', () => {
    expect(enumFileName('status')).toBe('status');
  });

  it('handles consecutive capitals', () => {
    expect(enumFileName('HTTPStatus')).toBe('http-status');
  });

  it('does NOT pluralize', () => {
    expect(enumFileName('Kind')).toBe('kind');
  });
});

describe('buildSharedTypesUserPrompt', () => {
  it('lists the pagination file in required outputs', () => {
    const prompt = buildSharedTypesUserPrompt(makeContract());
    expect(prompt).toContain('server/src/shared/pagination.ts');
    expect(prompt).toContain('server/src/shared/index.ts');
  });

  it('lists an enum file for each enum in the contract', () => {
    const prompt = buildSharedTypesUserPrompt(
      makeContract({
        enums: [
          { name: 'EquipmentStatus', description: null, values: [{ name: 'Active', label: null }] },
          { name: 'OrderKind', description: null, values: [{ name: 'Planned', label: null }] },
        ],
      }),
    );
    expect(prompt).toContain('server/src/enums/equipment-status.enum.ts');
    expect(prompt).toContain('server/src/enums/order-kind.enum.ts');
  });

  it('embeds the contract enums as a JSON projection', () => {
    const prompt = buildSharedTypesUserPrompt(
      makeContract({
        enums: [{ name: 'EquipmentStatus', description: null, values: [{ name: 'Active', label: null }] }],
      }),
    );
    expect(prompt).toContain('"EquipmentStatus"');
    expect(prompt).toContain('"Active"');
  });

  it('surfaces list endpoints so the LLM understands pagination consumers', () => {
    const prompt = buildSharedTypesUserPrompt(
      makeContract({
        endpoints: [
          {
            apiName: 'Equipment',
            name: 'listEquipment',
            label: 'POST /equipment/page',
            method: 'POST',
            path: '/equipment/page',
            description: null,
            attributes: [],
          },
        ],
      }),
    );
    expect(prompt).toContain('listEquipment');
  });

  it('works on an empty contract without throwing', () => {
    const prompt = buildSharedTypesUserPrompt(makeContract());
    expect(prompt).toContain('server/src/shared/pagination.ts');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('declares the strict JSON response format', () => {
    const prompt = buildSharedTypesUserPrompt(makeContract());
    expect(prompt).toMatch(/"files"\s*:\s*\[/);
  });
});
```

- [ ] **Step 3.2: Create the module with stubs and run tests to confirm failure**

Create `src/generator/stages/sharedTypesStage.ts`:
```ts
import type { FrozenContract } from '../contractFreeze.js';

export function enumFileName(_enumName: string): string {
  throw new Error('not implemented');
}

export function buildSharedTypesUserPrompt(_contract: FrozenContract): string {
  throw new Error('not implemented');
}
```

Run: `npm test -- sharedTypesStage.test`
Expected: all 10 tests fail with "not implemented".

- [ ] **Step 3.3: Implement `enumFileName` and `buildSharedTypesUserPrompt`**

Replace the entire file `src/generator/stages/sharedTypesStage.ts` with:
```ts
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
```

- [ ] **Step 3.4: Run tests and confirm pass**

Run: `npm test -- sharedTypesStage.test`
Expected: all 10 tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add runner/toir-fullstack-exporter/src/generator/stages/sharedTypesStage.ts \
        runner/toir-fullstack-exporter/src/generator/stages/sharedTypesStage.test.ts
git commit -m "feat(shared-types): pure prompt builder and enum filename helper

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Implement `runSharedTypesStage` (TDD with mocked `callLLM`)

**Files:**
- Modify: `src/generator/stages/sharedTypesStage.ts`
- Modify: `src/generator/stages/sharedTypesStage.test.ts`

- [ ] **Step 4.1: Add failing tests for `runSharedTypesStage`**

Append to `src/generator/stages/sharedTypesStage.test.ts` (add new imports at the top of the file and new `describe` block at the bottom):

Add near the top, after existing imports:
```ts
import { vi, beforeEach } from 'vitest';

vi.mock('../llmClient.js', () => ({
  callLLM: vi.fn(),
  extractCodeBlock: vi.fn((s: string) => s),
}));

import { callLLM } from '../llmClient.js';
import { runSharedTypesStage } from './sharedTypesStage.js';

const mockedCallLLM = vi.mocked(callLLM);
```

Add at the bottom of the file:
```ts
describe('runSharedTypesStage', () => {
  beforeEach(() => {
    mockedCallLLM.mockReset();
  });

  const oneEnumContract: FrozenContract = {
    sourceFiles: [],
    entities: [],
    enums: [
      {
        name: 'EquipmentStatus',
        description: null,
        values: [
          { name: 'Active', label: null },
          { name: 'Repair', label: null },
        ],
      },
    ],
    dtos: [],
    endpoints: [],
  };

  function llmReturns(files: Array<{ path: string; content: string }>) {
    mockedCallLLM.mockResolvedValue({
      content: JSON.stringify({ files }),
      usage: null,
    });
  }

  it('returns the files the LLM produced when they are in-zone', async () => {
    llmReturns([
      { path: 'server/src/enums/equipment-status.enum.ts', content: 'export enum EquipmentStatus {}' },
      { path: 'server/src/shared/pagination.ts', content: 'export interface PaginatedResponse<T> { data: T[]; total: number; }' },
      { path: 'server/src/shared/index.ts', content: "export * from './pagination';" },
    ]);

    const result = await runSharedTypesStage({ contract: oneEnumContract });

    expect(result.files).toHaveLength(3);
    expect(result.files.map((f) => f.path)).toEqual([
      'server/src/enums/equipment-status.enum.ts',
      'server/src/shared/pagination.ts',
      'server/src/shared/index.ts',
    ]);
  });

  it('drops files returned outside the allowed zones', async () => {
    llmReturns([
      { path: 'server/src/enums/equipment-status.enum.ts', content: 'export enum X {}' },
      { path: 'server/src/modules/foo/foo.module.ts', content: 'export class FooModule {}' },
    ]);

    const result = await runSharedTypesStage({ contract: oneEnumContract });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('server/src/enums/equipment-status.enum.ts');
  });

  it('throws when the LLM returns zero in-zone files', async () => {
    llmReturns([{ path: 'server/src/modules/foo.ts', content: 'x' }]);

    await expect(runSharedTypesStage({ contract: oneEnumContract })).rejects.toThrow(
      /no in-zone files returned/,
    );
  });

  it('throws when the LLM returns invalid JSON', async () => {
    mockedCallLLM.mockResolvedValue({
      content: 'this is not json at all',
      usage: null,
    });

    await expect(runSharedTypesStage({ contract: oneEnumContract })).rejects.toThrow();
  });

  it('appends previousError to the user prompt when repair feedback is supplied', async () => {
    llmReturns([
      { path: 'server/src/shared/pagination.ts', content: 'x' },
      { path: 'server/src/shared/index.ts', content: 'x' },
    ]);

    await runSharedTypesStage({
      contract: oneEnumContract,
      previousError: 'error: Missing file: server/src/shared/pagination.ts',
    });

    expect(mockedCallLLM).toHaveBeenCalledOnce();
    const userPrompt = mockedCallLLM.mock.calls[0][0].userPrompt;
    expect(userPrompt).toContain('PREVIOUS ATTEMPT FAILED');
    expect(userPrompt).toContain('Missing file: server/src/shared/pagination.ts');
  });

  it('calls the LLM with label "shared-types"', async () => {
    llmReturns([{ path: 'server/src/shared/pagination.ts', content: 'x' }]);

    await runSharedTypesStage({ contract: oneEnumContract });

    expect(mockedCallLLM).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'shared-types' }),
    );
  });
});
```

- [ ] **Step 4.2: Run tests and confirm they fail**

Run: `npm test -- sharedTypesStage.test`
Expected: the 6 new tests under `runSharedTypesStage` fail because the symbol is not exported.

- [ ] **Step 4.3: Implement `runSharedTypesStage`**

Add the following imports and function to `src/generator/stages/sharedTypesStage.ts`. The existing `enumFileName` and `buildSharedTypesUserPrompt` stay unchanged.

Add at the top of the file, after the existing import:
```ts
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { callLLM } from '../llmClient.js';
import { appendRepairFeedback, type StageInput } from '../repair.js';
import { parseLlmFiles } from './fileParser.js';
import type { FileEntry, StageResult } from './types.js';

const SYSTEM_PROMPT_PATH = fileURLToPath(
  new URL('../../../context/prompts/shared-types-rules.md', import.meta.url),
);

const ALLOWED_PREFIXES = ['server/src/enums/', 'server/src/shared/'] as const;
```

Note: we don't reuse `filterByPrefix` here because it takes a single prefix and we need to check against two. An inline loop is clearer than two calls + concat.

Add at the bottom of the file:
```ts
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
    throw new Error(`shared-types: no in-zone files returned (raw count=${parsed.length})`);
  }

  return { files: kept };
}
```

- [ ] **Step 4.4: Run tests and confirm pass**

Run: `npm test -- sharedTypesStage.test`
Expected: all 16 tests pass (10 from Task 3 + 6 new).

- [ ] **Step 4.5: Commit**

```bash
git add runner/toir-fullstack-exporter/src/generator/stages/sharedTypesStage.ts \
        runner/toir-fullstack-exporter/src/generator/stages/sharedTypesStage.test.ts
git commit -m "feat(shared-types): implement runSharedTypesStage with LLM call

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Extract `runTsBuildCheck` into its own module with dependency injection (TDD)

**Files:**
- Create: `src/generator/tsBuildCheck.ts`
- Create: `src/generator/tsBuildCheck.test.ts`
- Modify: `src/orchestrator.ts` (remove the old inline `runTsBuildCheck`)

- [ ] **Step 5.1: Write failing tests for the new module**

Create `src/generator/tsBuildCheck.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTsBuildCheck, type TsBuildCheckDeps } from './tsBuildCheck.js';
import type { TsCheckResult } from './tsCheck.js';

function okResult(): TsCheckResult {
  return { ok: true, exitCode: 0, stdout: '', stderr: '' };
}

function tscFailure(stdout: string): TsCheckResult {
  return { ok: false, exitCode: 1, stdout, stderr: '' };
}

function infraFailure(msg: string): TsCheckResult {
  return { ok: false, exitCode: 1, stdout: '', stderr: '', error: msg };
}

describe('runTsBuildCheck', () => {
  let deps: TsBuildCheckDeps;
  let tsCheck: ReturnType<typeof vi.fn>;
  let rerunStages: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tsCheck = vi.fn();
    rerunStages = vi.fn().mockResolvedValue(undefined);
    log = vi.fn().mockResolvedValue(undefined);
    deps = { tsCheck, rerunStages, log };
  });

  it('returns without repair when the first check passes', async () => {
    tsCheck.mockResolvedValueOnce(okResult());

    await runTsBuildCheck('/tmp/work', deps);

    expect(tsCheck).toHaveBeenCalledTimes(1);
    expect(rerunStages).not.toHaveBeenCalled();
  });

  it('runs the repair sweep when the first check reports tsc errors', async () => {
    tsCheck
      .mockResolvedValueOnce(tscFailure('src/modules/x.ts(1,1): error TS2322: ...'))
      .mockResolvedValueOnce(okResult());

    await runTsBuildCheck('/tmp/work', deps);

    expect(rerunStages).toHaveBeenCalledOnce();
    expect(tsCheck).toHaveBeenCalledTimes(2);
  });

  it('passes the TS error text as repair feedback to rerunStages', async () => {
    const errors = 'src/modules/x.ts(1,1): error TS2322: Type mismatch';
    tsCheck.mockResolvedValueOnce(tscFailure(errors)).mockResolvedValueOnce(okResult());

    await runTsBuildCheck('/tmp/work', deps);

    const feedback = rerunStages.mock.calls[0][0] as string;
    expect(feedback).toContain('TypeScript compilation failed');
    expect(feedback).toContain(errors);
  });

  it('throws with full TS output when the second check still fails', async () => {
    tsCheck
      .mockResolvedValueOnce(tscFailure('first round of errors'))
      .mockResolvedValueOnce(tscFailure('second round of errors'));

    await expect(runTsBuildCheck('/tmp/work', deps)).rejects.toThrow(
      /TypeScript build failed after repair/,
    );

    const err = await runTsBuildCheck('/tmp/work', deps).catch((e: Error) => e);
    expect((err as Error).message).toContain('second round of errors');
  });

  it('short-circuits on infra errors (npm install) without running the repair sweep', async () => {
    tsCheck.mockResolvedValueOnce(infraFailure('npm install failed: ENOENT'));

    await expect(runTsBuildCheck('/tmp/work', deps)).rejects.toThrow(/npm install failed/);

    expect(rerunStages).not.toHaveBeenCalled();
    expect(tsCheck).toHaveBeenCalledTimes(1);
  });

  it('short-circuits on infra errors (prisma generate)', async () => {
    tsCheck.mockResolvedValueOnce(infraFailure('prisma generate failed: schema invalid'));

    await expect(runTsBuildCheck('/tmp/work', deps)).rejects.toThrow(/prisma generate failed/);

    expect(rerunStages).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5.2: Create the module stub and run tests to confirm failure**

Create `src/generator/tsBuildCheck.ts`:
```ts
import type { TsCheckResult } from './tsCheck.js';

export interface TsBuildCheckDeps {
  tsCheck: (workingDir: string) => Promise<TsCheckResult>;
  rerunStages: (feedback: string) => Promise<void>;
  log: (message: string) => Promise<void>;
}

export async function runTsBuildCheck(
  _workingDir: string,
  _deps: TsBuildCheckDeps,
): Promise<void> {
  throw new Error('not implemented');
}
```

Run: `npm test -- tsBuildCheck.test`
Expected: all 6 tests fail with "not implemented".

- [ ] **Step 5.3: Implement `runTsBuildCheck`**

Replace `src/generator/tsBuildCheck.ts` with:
```ts
import type { TsCheckResult } from './tsCheck.js';

/**
 * Dependencies required by `runTsBuildCheck`. Injected so the function can be
 * unit-tested without spawning real npm/tsc processes or touching real LLM
 * stages.
 */
export interface TsBuildCheckDeps {
  /** Runs the actual `npm install + prisma generate + tsc --noEmit` pipeline. */
  tsCheck: (workingDir: string) => Promise<TsCheckResult>;
  /**
   * Re-runs the set of LLM stages that could be responsible for a tsc error,
   * in the fixed repair-sweep order (`shared-types → nest-entities → integration`).
   * Receives the TypeScript error text so stages can embed it as repair feedback.
   */
  rerunStages: (feedback: string) => Promise<void>;
  /** Progress logger (usually `sendProgress` bound to a job id). */
  log: (message: string) => Promise<void>;
}

/**
 * Runs a TypeScript compilation check against the generated server code.
 *
 * Flow:
 *   1. tsCheck() — on success, return.
 *   2. If the failure has an `error` field (npm install or prisma generate
 *      broke), throw immediately. Repair cannot fix infrastructure problems.
 *   3. Otherwise run the repair sweep once with the TS output as feedback.
 *   4. tsCheck() again. On success, return. On failure, throw with full TS
 *      output so the orchestrator's rollback sees exactly why the job failed.
 */
export async function runTsBuildCheck(
  workingDir: string,
  deps: TsBuildCheckDeps,
): Promise<void> {
  await deps.log('[ts-build] Running TypeScript check');

  const first = await deps.tsCheck(workingDir);
  if (first.ok) {
    await deps.log('[ts-build] TypeScript check passed');
    return;
  }

  if (first.error) {
    // Infra failure — npm install or prisma generate exploded. Repair
    // cannot fix this; surface the underlying error immediately.
    throw new Error(`ts-build: ${first.error}`);
  }

  const tsErrors = combineOutput(first);
  await deps.log('[ts-build] TypeScript errors found — running repair sweep');

  const feedback = `TypeScript compilation failed:\n\n${tsErrors}`;
  await deps.rerunStages(feedback);

  await deps.log('[ts-build] Re-checking TypeScript after repair');
  const second = await deps.tsCheck(workingDir);
  if (second.ok) {
    await deps.log('[ts-build] TypeScript check passed after repair');
    return;
  }

  if (second.error) {
    throw new Error(`ts-build: ${second.error}`);
  }

  const secondErrors = combineOutput(second);
  throw new Error(`TypeScript build failed after repair:\n\n${secondErrors}`);
}

function combineOutput(result: TsCheckResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}
```

- [ ] **Step 5.4: Run tests and confirm pass**

Run: `npm test -- tsBuildCheck.test`
Expected: all 6 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add runner/toir-fullstack-exporter/src/generator/tsBuildCheck.ts \
        runner/toir-fullstack-exporter/src/generator/tsBuildCheck.test.ts
git commit -m "feat(ts-build): extract into DI-friendly module with infra short-circuit

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Update `nestEntityStage.ts` — remove dual filter, add shared-types imports section

**Files:**
- Modify: `src/generator/stages/nestEntityStage.ts`

No new tests: this task only changes prompt text and reverts a previously-added filter. The correctness gate is the full pipeline run in Task 9.

- [ ] **Step 6.1: Remove the `enumsPrefix` and the dual-prefix filter**

Edit `src/generator/stages/nestEntityStage.ts`. Find:
```ts
        const kebab = entityKebab(entity.name);
        const allowedPrefix = `server/src/modules/${kebab}/`;
        const enumsPrefix = 'server/src/enums/';
```
Replace with:
```ts
        const kebab = entityKebab(entity.name);
        const allowedPrefix = `server/src/modules/${kebab}/`;
```

Then find the block:
```ts
          const parsed = parseLlmFiles(content);
          // Allow both the module zone and shared enums zone
          const moduleResult = filterByPrefix(parsed, allowedPrefix);
          const enumsResult = filterByPrefix(moduleResult.dropped, enumsPrefix);
          const kept = [...moduleResult.kept, ...enumsResult.kept];
          const dropped = enumsResult.dropped;

          for (const d of dropped) {
            console.warn(
              `[nest:${kebab}] WARN dropped out-of-zone file "${d.path}" (allowed prefixes: ${allowedPrefix}, ${enumsPrefix})`,
            );
          }
```
Replace with:
```ts
          const parsed = parseLlmFiles(content);
          const { kept, dropped } = filterByPrefix(parsed, allowedPrefix);

          for (const d of dropped) {
            console.warn(
              `[nest:${kebab}] WARN dropped out-of-zone file "${d.path}" (allowed prefix: ${allowedPrefix})`,
            );
          }
```

- [ ] **Step 6.2: Update the user prompt to reference shared types**

In the same file, find `buildNestUserPrompt` and locate this block:
```ts
    `Module file paths MUST start with \`${allowedPrefix}\`.`,
    `Shared enum files MAY use path \`server/src/enums/<EnumName>.enum.ts\`.`,
    'Do NOT generate `app.module.ts`, auth files, Prisma schema, or any other shared/integration',
    'file — those are owned by other stages and will be dropped if returned here.',
```
Replace with:
```ts
    `All file paths MUST start with \`${allowedPrefix}\`.`,
    'Do NOT generate `app.module.ts`, auth files, Prisma schema, shared enum files,',
    'or any other shared/integration file — those are owned by other stages and will',
    'be dropped if returned here.',
    '',
    '## Available shared types (already generated by prior stages)',
    '',
    'Import these by path; DO NOT redefine them:',
    '',
    '- Enum types: `../../enums/<kebab-enum-name>.enum` — e.g.',
    "  `import { EquipmentStatus } from '../../enums/equipment-status.enum';`",
    '- Pagination types: `../../shared/pagination` — e.g.',
    "  `import { PaginatedResponse, ListQueryParams } from '../../shared/pagination';`",
    '',
    'DTO enum fields MUST be declared with the real enum type (not `string`),',
    'imported from the enum file above. `@IsEnum(EnumName)` still applies.',
    'Service code passing DTOs into Prisma then works WITHOUT `as EnumName` casts',
    'because the TS types align.',
```

- [ ] **Step 6.3: Confirm the file still compiles**

Run: `npm test`
Expected: all existing tests still pass (no new tests were added in this task; we just need to confirm the changes did not break any test file).

- [ ] **Step 6.4: Commit**

```bash
git add runner/toir-fullstack-exporter/src/generator/stages/nestEntityStage.ts
git commit -m "refactor(nest-entities): drop dual zone, cite shared types in prompt

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Wire `runSharedTypesStage` and the new `runTsBuildCheck` into `orchestrator.ts`

**Files:**
- Modify: `src/orchestrator.ts`

No unit test: the orchestrator is exercised end-to-end by the real pipeline. Correctness is verified by the manual smoke run in Task 9.

- [ ] **Step 7.1: Add imports for the new stage and module**

Edit `src/orchestrator.ts`. Find:
```ts
import { runValidator } from './generator/validate.js';
import { runTsCheck } from './generator/tsCheck.js';
import { runPrismaStage } from './generator/stages/prismaStage.js';
```
Replace with:
```ts
import { runValidator } from './generator/validate.js';
import { runTsCheck } from './generator/tsCheck.js';
import { runTsBuildCheck } from './generator/tsBuildCheck.js';
import { runPrismaStage } from './generator/stages/prismaStage.js';
import { runSharedTypesStage } from './generator/stages/sharedTypesStage.js';
```

- [ ] **Step 7.2: Call the new stage between prisma and nest-entities**

Find:
```ts
  await runLlmStage(jobId, 'prisma', workingDir, contract, runPrismaStage);
  await runLlmStage(jobId, 'nest-entities', workingDir, contract, (input) =>
```
Replace with:
```ts
  await runLlmStage(jobId, 'prisma', workingDir, contract, runPrismaStage);
  await runLlmStage(jobId, 'shared-types', workingDir, contract, runSharedTypesStage);
  await runLlmStage(jobId, 'nest-entities', workingDir, contract, (input) =>
```

- [ ] **Step 7.3: Replace the inline `runTsBuildCheck` call with a DI invocation of the new module**

Find:
```ts
  await runLlmStage(jobId, 'auth', workingDir, contract, runAuthStage);

  // Stage 8 — TypeScript build check with one repair pass
  await runTsBuildCheck(jobId, workingDir, contract);
```
Replace with:
```ts
  await runLlmStage(jobId, 'auth', workingDir, contract, runAuthStage);

  // Stage 8b — TypeScript build check with repair sweep shared-types → nest-entities → integration
  await runTsBuildCheck(workingDir, {
    tsCheck: runTsCheck,
    log: (msg: string) => sendProgress(jobId, 'processing', msg),
    rerunStages: async (feedback: string) => {
      const inject = { contract, previousError: feedback };
      await runLlmStage(jobId, 'shared-types', workingDir, contract, (input) =>
        runSharedTypesStage({ ...input, ...inject }),
      );
      await runLlmStage(jobId, 'nest-entities', workingDir, contract, (input) =>
        runNestEntityStage({
          ...input,
          ...inject,
          onProgress: (msg) => sendProgress(jobId, 'processing', `[nest-entities] ${msg}`),
        }),
      );
      await runLlmStage(jobId, 'integration', workingDir, contract, (input) =>
        runIntegrationStage({ ...input, ...inject }),
      );
    },
  });
```

- [ ] **Step 7.4: Delete the old inline `runTsBuildCheck` helper function**

Find the function definition that starts:
```ts
/**
 * Runs TypeScript compilation check (npm install + prisma generate + tsc --noEmit)
 * against the generated server code. On failure, re-runs nest-entities and integration
 * stages with the TS errors as repair feedback, then checks again.
 */
async function runTsBuildCheck(
  jobId: string,
  workingDir: string,
  contract: FrozenContract,
): Promise<void> {
```
Delete the entire function (through the closing `}`). The new version lives in `src/generator/tsBuildCheck.ts`, and the call site above invokes it with injected dependencies.

- [ ] **Step 7.5: Type-check the orchestrator**

Run: `npx tsc --noEmit`
Expected: no type errors.

If there is an "unused import" error for `FrozenContract`, leave the import — it is still used by other functions in the file (`runLlmStage`). If it is actually unused after Step 7.4, remove it from the import list.

- [ ] **Step 7.6: Run the full test suite to confirm nothing regressed**

Run: `npm test`
Expected: all tests pass. No file in `src/` should emit new failures.

- [ ] **Step 7.7: Commit**

```bash
git add runner/toir-fullstack-exporter/src/orchestrator.ts
git commit -m "feat(orchestrator): wire shared-types stage and DI ts-build sweep

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Update `backend-rules.md`

**Files:**
- Modify: `context/prompts/backend-rules.md`

No tests: this is a prompt text change. Behavior is verified in Task 9.

- [ ] **Step 8.1: Remove the stale "Shared Enum Files" section**

Edit `context/prompts/backend-rules.md`. Find and delete the entire section that starts with `## Shared Enum Files` and continues up to (but not including) the next `##` heading. This section was added in a prior fix that put enum generation inside `nest-entities`; it is now wrong because enum files are generated by the `shared-types` stage.

- [ ] **Step 8.2: Add the new "Shared Types" section in the same position**

Insert the following block where the old "Shared Enum Files" section was (just before `## Auth Import Paths`):

```markdown
## Shared Types

Shared TypeScript types are generated by the `shared-types` stage BEFORE
`nest-entities` runs. Per-entity modules MUST import them; they must NEVER
redefine them.

Zones:

- `server/src/enums/<kebab-enum-name>.enum.ts` — one file per DSL enum
- `server/src/shared/pagination.ts` — `PaginatedResponse<T>` and `ListQueryParams`
- `server/src/shared/index.ts` — barrel for shared types

Import conventions from a module at `server/src/modules/<kebab>/`:

```ts
import { EquipmentStatus } from '../../enums/equipment-status.enum';
import { PaginatedResponse, ListQueryParams } from '../../shared/pagination';
```

Enum-typed DTO fields MUST be declared with the actual enum type, NOT
`string`. The enum is imported from the shared file above. `@IsEnum(EnumName)`
still applies at runtime for validation. Because the DTO type matches the
Prisma-generated enum type by name and by string values, service code can
pass DTOs into Prisma without `as EnumName` casts.
```

- [ ] **Step 8.3: Update the DSL → TS DTO type mapping table**

Find the table row:
```
| enum name | `string`    | `@IsEnum(EnumName)`       |                               |
```
Replace with:
```
| enum name | `EnumName` (imported from `../../enums/<kebab>.enum`) | `@IsEnum(EnumName)` | Do not use `string` |
```

- [ ] **Step 8.4: Commit**

```bash
git add runner/toir-fullstack-exporter/context/prompts/backend-rules.md
git commit -m "docs(prompts): retarget enum rules at shared-types stage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Rebuild the runner and verify end-to-end

No code changes. This task verifies that the pipeline produces a buildable server project for the TOiR DSL.

- [ ] **Step 9.1: Rebuild the runner container**

Run from `aid/`:
```bash
docker compose build runner-toir-fullstack-exporter
docker compose up -d runner-toir-fullstack-exporter
```
Expected: build succeeds, container is up.

- [ ] **Step 9.2: Submit a generation job with the TOiR DSL**

Use whatever mechanism the operator normally uses to post a job to the runner (the same path that produced `gen-20260409-*` previously). Watch the runner logs for the new `shared-types` stage entries:

```
[shared-types] Running stage
[Stage shared-types] Attempt 1/2
[shared-types] LLM tokens — prompt: ..., completion: ..., total: ...
[shared-types] Wrote 3 files
```

(Expected file count is `N_enums + 2`. For TOiR's single enum, that is 3: one enum file + pagination + barrel.)

- [ ] **Step 9.3: Inspect the generated files on disk (before deploy)**

SSH / exec into the runner container and list the generated job directory:
```bash
docker exec aid-runner-toir-fullstack-exporter sh -c 'ls -la /tmp/jobs/*/server/src/enums /tmp/jobs/*/server/src/shared'
```

Expected output includes `equipment-status.enum.ts`, `pagination.ts`, `index.ts`.

- [ ] **Step 9.4: Watch the `ts-build` stage log**

Look for:
```
[ts-build] Running TypeScript check
[ts-build] TypeScript check passed
```
Expected: `tsc --noEmit` passes on the first attempt. No repair sweep should run.

- [ ] **Step 9.5: Verify Portainer stack creation succeeds**

The Portainer stack creation step should no longer fail at `npm run build`. If it does, capture the full TS error output from the `ts-build` logs and investigate — the repair sweep should have already attempted a fix, so a remaining failure is a real regression, not a transient.

- [ ] **Step 9.6: Final commit (if any manual cleanup was needed)**

If Step 9.1–9.5 produced any follow-up fixes, commit them now. Otherwise skip this step.

---

## Out of scope (deferred)

- Integration smoke test that actually calls the LLM. Gated behind `REAL_LLM=1` env var. Not part of this plan because it requires credentials and is non-deterministic.
- Extending `validate-generation.mjs` to check for the presence of each enum file. This would make the `runStageWithRepair` auto-retry path active for `shared-types` in addition to the `ts-build` sweep. Explicitly out of scope per the spec §"Note on runStageWithRepair auto-retry vs ts-build sweep".
- Dual zone (Z2) adding `client/src/enums/` and `client/src/shared/`. Out of scope; react side has no active failures.
- Extracting `PaginatedResponse<T>` / `ListQueryParams` usage out of per-entity service code into imports. The `nest-entities` prompt now tells the LLM to import them, but existing services may still inline them until re-generated. That is acceptable; the next generation run picks up the new rule.

## Self-review notes

- **Spec coverage:** Every decision in the design spec (sections 1–6) maps to at least one task above. Stage position → Task 7. Stage spec → Tasks 3, 4. Files produced → Task 2 (rules) and Task 4 (stage). Changes to smaller files → Tasks 1, 6, 7, 8. Data flow and error handling → Tasks 5, 7. Testing plan → Tasks 1, 3, 4, 5.
- **Placeholder scan:** No `TBD`, `TODO`, or "similar to" references. Every code block is complete as written.
- **Type consistency:** `TsBuildCheckDeps`, `StageName` (`'shared-types'`), `runSharedTypesStage`, `buildSharedTypesUserPrompt`, `enumFileName` — all identifiers defined in one task match how later tasks reference them.
