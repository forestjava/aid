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
