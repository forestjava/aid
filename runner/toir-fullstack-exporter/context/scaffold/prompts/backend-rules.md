# Backend Rules

Use this document during the **E. Parallel Specialized Generation** stage
defined in `prompts/general-prompt.md`.

## Purpose

Generate NestJS CRUD artifacts that match the DSL contract exactly and remain compatible with a standard NestJS workspace.

Ownership rule:

- this stage belongs to `generator_nest_resources` after contract freeze
- parent retains ownership of shared auth strategy, JWT/JWKS design, global backend infra, runtime, and deploy seams
- backend resource generation may attach already-defined auth platform seams where required by the frozen contract, but must not redesign them

## Mandatory Inputs

- `prompts/general-prompt.md`
- the active `api API.<Entity>` block from `domain/toir.api.dsl`
- referenced DTOs and enums from `domain/toir.api.dsl`
- an intact or repaired official NestJS scaffold under `server/`

`api-summary.json` may be consulted only as an auxiliary inventory or validator-related artifact. It must never replace the DSL as the backend source of truth.

## Expected Outputs

Per entity:

- `server/src/modules/<kebab>/<kebab>.module.ts`
- `server/src/modules/<kebab>/<kebab>.controller.ts`
- `server/src/modules/<kebab>/<kebab>.service.ts`
- `server/src/modules/<kebab>/dto/create-<kebab>.dto.ts`
- `server/src/modules/<kebab>/dto/update-<kebab>.dto.ts`

Repository-wide:

- `server/src/app.module.ts` registrations

## Scaffold Baseline

- Start backend initialization and repair from the official NestJS CLI workspace, not from hand-written files.
- Preserve Nest workspace essentials:
  - `server/tsconfig.json`
  - `server/tsconfig.build.json`
  - `server/nest-cli.json`
  - `server/src/main.ts`
  - `server/src/app.module.ts`
- If the workspace is degraded, repair it before generating domain code.

Forbidden patterns:

- hand-written pseudo-Nest scaffolds
- deleting required Nest config files after generation
- replacing normal Nest build/start behavior with ad hoc scripts

## Approved Backend Dependency Baseline

When the backend workspace is created or repaired, pin the backend package manifest to these exact versions before continuing:

- `@nestjs/common`: `11.1.18`
- `@nestjs/core`: `11.1.18`
- `@nestjs/platform-express`: `11.1.18`
- `@nestjs/testing`: `11.1.18`
- `@nestjs/config`: `4.0.3`
- `@nestjs/cli`: `11.0.17`
- `@nestjs/schematics`: `11.0.10`
- `class-validator`: `0.15.1`
- `class-transformer`: `0.5.1`
- `jose`: `6.2.2`
- `reflect-metadata`: `0.2.2`
- `rxjs`: `7.8.1`
- backend `typescript`: `5.7.3`

Pinning rules:

- Use exact versions, not `latest` and not caret ranges.
- Keep the Nest runtime packages on the same approved major/minor line.
- Prisma-specific versions are governed by `prompts/prisma-rules.md`.

## Route And Resource Contract

- Use the shared entity-to-resource naming convention from `prompts/general-prompt.md`.
- Each entity becomes a NestJS module, controller, service, and create/update DTO pair.
- CRUD routes use the real primary key name in the path.
- Every API record returned to React Admin must include `id`.
- For natural-key entities, map the real primary key to `id` in responses and sort translation.

## DTO Contract

- `DTO.<Entity>Create` defines `Create<Entity>Dto`.
- `DTO.<Entity>Update` defines `Update<Entity>Dto`.
- Do not invent fields or pull field lists from memory.
- Never include `id` in Create/Update DTOs.

Type and decorator rules:

| DSL type  | TS DTO type | class-validator decorator | Notes                         |
| --------- | ----------- | ------------------------- | ----------------------------- |
| `uuid`    | `string`    | `@IsUUID()`               |                               |
| `string`  | `string`    | `@IsString()`             |                               |
| `text`    | `string`    | `@IsString()`             |                               |
| `integer` | `number`    | `@IsInt()`                |                               |
| `number`  | `number`    | `@IsNumber()`             |                               |
| `decimal` | `string`    | `@IsString()`             | serialize with Prisma Decimal |
| `date`    | `string`    | `@IsString()`             | serialize as ISO string       |
| `boolean` | `boolean`   | `@IsBoolean()`            |                               |
| enum name | `string`    | `@IsEnum(EnumName)`       |                               |

Nullability rules:

- every field that is not `is required` gets `@IsOptional()` before the type decorator
- every generated DTO imports from `'class-validator'`

## Controller Contract

- Apply `@UseGuards(JwtAuthGuard, RolesGuard)` at controller class level.
- Guard order: JwtAuthGuard must run before RolesGuard to ensure token validation precedes role extraction.
- Roles per verb:
  - `GET` -> `viewer | editor | admin`
  - `POST`, `PATCH`, `PUT` -> `editor | admin`
  - `DELETE` -> `admin`
- Reconcile DSL HTTP shapes for repository compatibility:
  - list endpoints declared as `POST .../page` generate as `@Get()` with React Admin query params
  - update endpoints declared as `PUT` generate as `@Patch(':<pk>')`
- Path parameters are taken from the DSL endpoint contract, not invented from generic CRUD memory.

## Service Contract

- Never pass raw update DTOs directly into Prisma update `data`.
- Strip `id`, the real primary key, and readonly fields before writes.
- Keep `PrismaService` lightweight:
  - extend `PrismaClient`
  - implement `OnModuleInit`
  - call `$connect()`
  - do not add `beforeExit`

List endpoint requirements:

- accept React Admin query params: `_start`, `_end`, `_sort`, `_order`, `q`
- set `Content-Range: items <start>-<end>/<total>` header (RFC 7233 format for items, not bytes)
- set `Access-Control-Expose-Headers: Content-Range`
- return HTTP 200 for successful pagination

Filtering rules:

- string/text filters may use case-insensitive `contains`
- foreign-key scalar filters must use exact-match semantics
- enum filters must support both single and repeated params
- repeated enum params must map to Prisma `{ in: [...] }`
- `_sort=id` must map to the real primary key for natural-key entities

Decimal and date handling:

- `decimal` writes: `new Prisma.Decimal(value)`
- `decimal` reads: `.toString()`
- `date` writes: `new Date(value)`
- `date` reads: `.toISOString()`

## Natural-Key Rules

For entities whose physical primary key is not `id`:

- route params use the real primary key name
- responses expose `id` mapped from that primary key
- sort/update behavior never targets a fake physical `id`
- update payload sanitization removes both `id` and the real primary key

## Completion Expectations

Backend generation is incomplete if any of the following is true:

- required Nest scaffold files are missing
- DTO decorators are incomplete or type-incorrect
- controllers are missing guards or role decorators
- natural-key handling regresses to a fake physical `id`
- list/filter behavior is incompatible with React Admin expectations
