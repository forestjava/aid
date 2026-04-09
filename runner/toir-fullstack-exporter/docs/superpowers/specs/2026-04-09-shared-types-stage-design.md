# Shared Types Stage — Design Spec

**Date:** 2026-04-09
**Status:** Approved by user; ready for planning
**Supersedes:** The earlier ad-hoc extension of `nest-entities` zone to include `server/src/enums/`

## Problem

The `toir-fullstack-exporter` runner generates a NestJS + React Admin project from a DSL. After per-entity parallel generation, the project fails TypeScript compilation with two recurring classes of error:

1. `Cannot find module '../../enums/<name>.enum'` — shared enum files are either missing or present for some entities and not others. Cause: each `nest-entities` entity-stage runs in parallel and competes to emit the same shared enum file; the result is flaky.

2. `Type 'string' is not assignable to type 'EquipmentStatus'` — DTO enum fields are declared as `string` per the current backend rules, but Prisma's generated client uses real string enums. Passing a DTO field into a Prisma input causes a nominal type mismatch.

Both classes block Portainer deployment (the Docker build fails at `npm run build`). The existing `ts-build` repair sweep re-runs LLM stages but cannot reliably fix the enum races because the work is still entity-scoped and parallel.

## Goals

- Make shared TypeScript types (enums, pagination generics, list query params) produced exactly once per job, by a single deterministic entry point in the pipeline.
- Eliminate the `string → enum` type mismatch at DTO boundaries without manual casts in services.
- Keep the pipeline domain-agnostic: the runner must work for any DSL, not only `toir.api.dsl`. No DSL-specific content in the runner code.
- Preserve the existing repair flow architecture; extend it rather than replacing it.

## Non-goals

- Client-side shared types (React Admin resources). The `ts-build` check runs only on the server today; client is out of scope for this change.
- Deterministic (JS-code) generation of types. We keep LLM-driven generation for consistency with the rest of the pipeline and to avoid maintaining two parallel generators.
- Extending `ts-build` to cover additional checks (lint, eslint, frontend tsc). Out of scope.

## Decisions (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| 1 | LLM-based `shared-types` stage (not deterministic codegen) | One generation approach across the pipeline; future DSL evolution handled via prompt updates, not JS-code patches |
| 2 | DTO enum fields typed as real enum, not `string` (A2) | Removes `as EnumName` casts; type-safe DTO→Prisma assignment |
| 3 | Stage emits enums + `PaginatedResponse<T>` + `ListQueryParams` (S2, T2) | Pagination types are already de-facto shared and will be pulled out of `nest-entities` prompts |
| 4 | Zone is server-side only (Z1) | Current `ts-build` runs only on server; client has no active failures; YAGNI for dual zone |
| 5 | On `ts-build` failure: fixed repair sweep `shared-types → nest-entities → integration` (R1) | Error-to-stage attribution is unreliable; cost of one extra LLM call is negligible compared to `npm install` + `tsc` |

## Architecture

### Pipeline position

```
0  fetch DSL
1  contract-freeze
2  scaffold
3  context-sync
4  prisma
4b shared-types        ← NEW
5  nest-entities
6  react-entities
7  integration
8  auth
8b ts-build (repair sweep with shared-types at the head)
9  post-process
10 validate
11 deploy
```

The stage runs linearly after `prisma` and before `nest-entities`. It depends only on `FrozenContract`; it does not read anything from disk except indirectly via the standard stage plumbing.

### One LLM call, not parallel

Unlike `nest-entities`, the stage makes a **single** LLM call per job. The set of shared types is small and coupled (they should be internally consistent: `PaginatedResponse<T>` uses the same generic convention everywhere), so one call with full shared-layer context is better than per-type parallelism.

### Integration with existing `runStageWithRepair`

`runSharedTypesStage` has the same shape as other LLM stages and plugs into `runStageWithRepair` unchanged. The repair helper's structural validator loop applies: if the stage writes files and the structural validator reports a failure pointing at `server/src/enums/` or `server/src/shared/`, the stage re-runs once with `previousError` populated.

`STAGE_ZONES` in `src/generator/repair.ts` gains a new entry:

```ts
{ stage: 'shared-types', patterns: [/^server\/src\/enums\//, /^server\/src\/shared\//] }
```

The temporary `^server/src/enums/` pattern that was added to `nest-entities` earlier is **removed** from there — the zone ownership moves to `shared-types`.

The `StageName` union in `repair.ts` gains `'shared-types'`.

## Components

### New file: `src/generator/stages/sharedTypesStage.ts`

Exports `runSharedTypesStage(input: StageInput): Promise<StageResult>`.

Inputs read from the contract:
- `contract.enums` — drives the list of enum files to emit
- `contract.dtos` — referenced in the prompt as consumers so the LLM understands the purpose
- `contract.endpoints` — list endpoints are surfaced so the LLM justifies `PaginatedResponse` / `ListQueryParams`

Prompt shape:
- System prompt: short, hand-authored, placed in `context/prompts/shared-types-rules.md` (new file) and loaded at call time (same pattern as other stages).
- User prompt: a JSON projection `{ enums, listEndpoints }` plus the strict single-JSON response contract and the exact allowed file paths.

LLM parameters:
- `maxTokens: 4000`
- `temperature: 0.2`
- `label: 'shared-types'`

Progress logs (consistent with other stages):
```
[shared-types] Running stage
[shared-types] Wrote N files
[shared-types] LLM tokens — prompt: X, completion: Y, total: Z
```

Error handling inside the stage:
- 0 files returned in-zone → `throw`. Propagates through `runStageWithRepair` (the helper does NOT catch stage throws) and through `runStage` in the orchestrator, which fails the whole job. No auto-retry here.
- Some files out-of-zone → dropped via `filterByPrefix`, warning logged, not an error
- Missing expected file (e.g. enum is there but `pagination.ts` is not) → warning, not an error; `ts-build` will catch the consequence as a compile error and will drive the cross-stage repair sweep

### Note on `runStageWithRepair` auto-retry vs `ts-build` sweep

`runStageWithRepair` auto-retries a stage when the **structural validator** (`validate-generation.mjs`) reports a failure pointing at the stage's zone after files are written. The structural validator currently does **not** inspect `server/src/enums/` or `server/src/shared/`, so the structural auto-retry path for `shared-types` is effectively inactive out of the box. This is intentional: the primary repair driver for `shared-types` mistakes is the `ts-build` sweep, which is strictly more informative (it catches real TypeScript errors, not just missing-file heuristics).

A future improvement can extend `validate-generation.mjs` to assert that each enum in the contract has a matching file in `server/src/enums/`, which would make the structural auto-retry active as well. Out of scope for this change.

### New file: `context/prompts/shared-types-rules.md`

Rules for the LLM:
- Output zones: `server/src/enums/`, `server/src/shared/`
- One file per enum, kebab-case filename (`EquipmentStatus → equipment-status.enum.ts`)
- Enum values are string, identical to DSL value names
- `server/src/shared/pagination.ts` contains `PaginatedResponse<T>` and `ListQueryParams`
- `server/src/shared/index.ts` re-exports pagination
- Strict JSON output contract (`{"files":[...]}`)
- Explicit prohibition of writing outside the two zones

### Modified file: `src/generator/stages/nestEntityStage.ts`

- Remove the `enumsPrefix` double-filter introduced earlier. Single allowed zone: `server/src/modules/<kebab>/`.
- Add an "Available shared types" section to the user prompt:
  ```
  The following shared types are already generated by prior stages.
  Import them by path (do NOT redefine):
    - EnumName        → `../../enums/<kebab-enum>.enum`
    - PaginatedResponse<T>, ListQueryParams → `../../shared/pagination`
  ```
- Pass `contract.enums` to the prompt but framed as "import-only", not "define".

### Modified file: `src/generator/repair.ts`

- Add `'shared-types'` to `StageName`.
- Add new `STAGE_ZONES` entry (see above).
- Remove `^server\/src\/enums\//` from the `nest-entities` zone.

### Modified file: `src/orchestrator.ts`

- Import `runSharedTypesStage`.
- Insert stage call between `prisma` and `nest-entities`:
  ```ts
  await runLlmStage(jobId, 'prisma', workingDir, contract, runPrismaStage);
  await runLlmStage(jobId, 'shared-types', workingDir, contract, runSharedTypesStage);
  await runLlmStage(jobId, 'nest-entities', ...);
  ```
- In `runTsBuildCheck`, change the repair sweep order to `shared-types → nest-entities → integration`.
- In `runTsBuildCheck`, short-circuit on infra errors: if `runTsCheck` returns with the `error` field set (npm install or prisma generate failed), `throw` immediately without running the repair sweep. Only real `tsc` compilation errors trigger repair.

### Modified file: `context/prompts/backend-rules.md`

- Remove the "Shared Enum Files" section added earlier (that told `nest-entities` to emit enum files). Replace with a "Shared Types" section describing import conventions only.
- Update the DSL→TS type mapping table: `enum name → EnumName (imported from ../../enums/<kebab>.enum) + @IsEnum(EnumName)` (was `string + @IsEnum(EnumName)`).
- Add explicit rule: "Enum-typed DTO fields MUST be declared with the actual enum type, NOT string."
- Do not introduce any `dto.field as EnumName` cast guidance — A2 typing makes the cast unnecessary. (There is no such rule in the current `backend-rules.md` to remove; this is a forward-looking note.)

## Files produced by the stage

**Dynamic (one per enum in the contract):**
```
server/src/enums/<kebab-name>.enum.ts
```

Shape:
```ts
export enum EquipmentStatus {
  Active = 'Active',
  Repair = 'Repair',
  Reserve = 'Reserve',
  WriteOff = 'WriteOff',
}
```

**Static set:**

`server/src/shared/pagination.ts`:
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

`server/src/shared/index.ts`:
```ts
export * from './pagination';
```

Total files per job: `N_enums + 2`.

## Data flow

### Happy path

```
contract-freeze
  → prisma writes server/prisma/schema.prisma
  → shared-types writes server/src/enums/* + server/src/shared/*
  → nest-entities writes server/src/modules/** (importing enums + pagination)
  → react-entities, integration, auth (unchanged)
  → ts-build: npm install + prisma generate + tsc --noEmit → OK
  → post-process → validate → deploy
```

### Repair sweep on ts-build failure

```
ts-build fails with TS errors
  → repair sweep (single pass):
      shared-types (with full TS output as previousError)
      nest-entities (same previousError)
      integration (same previousError)
  → ts-build (second run)
  → OK → deploy
  → still failing → throw → rollback
```

### Infra error early-return

```
runTsCheck returns ok: false with error: "npm install failed: ..."
  → throw immediately, skip repair sweep
  → rollback
```

## Error handling summary

| Error class | Handled by | Action |
|---|---|---|
| Stage returns 0 in-zone files | stage function itself | Throw; propagates up and fails the job (no retry in this path) |
| Stage returns file out of zone | `filterByPrefix` | Drop, warn, continue |
| Stage missing expected file (partial output) | `runTsBuildCheck` | `tsc` error surfaces; repair sweep re-runs the stage with previousError |
| `tsc` compile error | `runTsBuildCheck` | Repair sweep (shared-types → nest-entities → integration) |
| `npm install` / `prisma generate` failure | `runTsBuildCheck` | Throw immediately, no repair |
| Second `ts-build` still failing | `runTsBuildCheck` | Throw with full TS output |

## Testing plan

TDD, each step red → green → refactor.

### Layer 1 — pure functions (unit, no LLM, no filesystem)

1. `buildSharedTypesUserPrompt(contract)` determinism:
   - Contract with one enum → prompt contains that enum name and all its values
   - Contract with three enums → all three names present
   - Contract with empty `enums` → prompt still valid, contains only pagination section
   - List endpoints referenced in prompt by count or name

2. `STAGE_ZONES` attribution:
   - `failuresForStage([{files: ['server/src/enums/foo.enum.ts']}], 'shared-types')` → matches
   - `failuresForStage([{files: ['server/src/modules/foo/foo.module.ts']}], 'shared-types')` → empty
   - `failuresForStage([{files: ['server/src/enums/foo.enum.ts']}], 'nest-entities')` → empty (zone no longer attributed to nest-entities)

### Layer 2 — stage function with mocked LLM (unit, temp filesystem)

3. `runSharedTypesStage` with a mocked `callLLM`:
   - Valid JSON with one enum + pagination + index → three `FileEntry` items with correct paths
   - JSON containing a file outside the zone → dropped, warning logged, other files kept
   - Zero files → throw
   - Invalid JSON → throw (propagated from `parseLlmFiles`)
   - `previousError` passed → `appendRepairFeedback` output visible in captured user prompt

### Layer 3 — `runTsBuildCheck` behavior with mocked `runTsCheck`

4. `runTsCheck` returns `ok: true` first → no repair, no stage invocations
5. `runTsCheck` returns `ok: false` with tsc errors → stages called in order `shared-types`, `nest-entities`, `integration`
6. Second `runTsCheck` returns `ok: true` → success
7. Second `runTsCheck` still `ok: false` → throws with full TS output in message
8. `runTsCheck` returns `ok: false` with `error` field set (infra) → throws immediately, no stage invocations

### Layer 4 — integration smoke (optional, gated)

9. Run real `runSharedTypesStage` + `runNestEntityStage` on the equipment fixture under `tools/eval/fixtures/` and check disk contents:
   - `server/src/enums/equipment-status.enum.ts` exists and parses as valid TS
   - `server/src/modules/equipment/dto/create-equipment.dto.ts` contains `import { EquipmentStatus } from '../../enums/equipment-status.enum'`
   - `server/src/shared/pagination.ts` contains `export interface PaginatedResponse`

   Marked `describe.skip` by default; run manually with `REAL_LLM=1` or similar env flag.

### Not tested

- Real `npm install` / `tsc` in unit tests (too slow, too flaky)
- Real Docker build (out of scope)
- LLM output semantic correctness (ts-build at runtime is the gate)

## Implementation order (TDD)

1. Layer 1 tests → implement `buildSharedTypesUserPrompt`, update `STAGE_ZONES`, add `'shared-types'` to `StageName`
2. Layer 2 tests → implement `runSharedTypesStage`
3. Layer 3 tests 4-6 → update `runTsBuildCheck` sweep order
4. Layer 3 tests 7-8 → add infra-error early return
5. Update `nestEntityStage.ts` (remove double filter, add shared-types import section in prompt)
6. Update `backend-rules.md` (enum typing rule, import paths)
7. Update `orchestrator.ts` (wire the new stage in between `prisma` and `nest-entities`)
8. Manual fixture run (layer 4) to confirm end-to-end behavior

## Open questions

None at spec-approval time. If implementation surfaces ambiguity, revisit this doc.
