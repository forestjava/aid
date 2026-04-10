# Prisma Rules

<!-- prompt-version: 2.0 -->
<!-- applies-to: server/prisma/schema.prisma -->
<!-- generated-by: LLM following these rules -->
<!-- source-of-truth: domain/toir.api.dsl -->
<!-- validated-by: tools/validate-generation.mjs §validateBuildChecks -->

Use this document during the **E. Parallel Specialized Generation** stage
defined in `prompts/general-prompt.md`.

## Purpose

Generate `server/prisma/schema.prisma` as a faithful reflection of `domain/toir.api.dsl`.

Ownership rule:

- this stage belongs to `generator_prisma` after contract freeze
- Prisma work is limited to schema/model artifacts and optional parent-requested machine-readable summaries
- do not redesign backend/frontend/auth/runtime/platform seams from this stage

## Mandatory Inputs

- `prompts/general-prompt.md`
- the relevant entity/enum definitions from `domain/toir.api.dsl`
- the existing Prisma header if `server/prisma/schema.prisma` already exists

`api-summary.json` may be used only as an auxiliary validator/inventory artifact. It is not part of the authoritative Prisma source hierarchy.

## Expected Output

- `server/prisma/schema.prisma`

Never edit the schema manually during normal generation. Change the DSL and regenerate instead.

## Approved Dependency Baseline

- Runtime baseline for Prisma work: Node.js `22.12.0` or newer within the Node 22 LTS line
- `prisma`: `6.16.2`
- `@prisma/client`: `6.16.2`
- backend `typescript`: `5.7.3`

Version rules:

- Keep `prisma` and `@prisma/client` on the same exact version.
- Do not replace the approved Prisma v6 line with Prisma v7 during routine regeneration or scaffold repair.
- If a task explicitly upgrades Prisma majors, update the runtime/bootstrap contract and verification expectations in the same change.

## Migration Policy

- Preferred target policy: when the DSL changes the database shape, generate the schema and create or update Prisma migrations so deploys use migration history as the primary path.
- Current repository practice: the runtime entrypoint may fall back to `prisma db push` when no migration history exists, so fresh local or bootstrap environments still come up. Treat that fallback as bootstrap debt, not the desired steady state.
- If a schema change is committed without a migration, call it out explicitly as temporary technical debt and schedule the migration in the next repair pass.

## Source Of Truth

Entity definitions, field types, PKs, FKs, enums, optionality, uniqueness, and defaults come from `domain/toir.api.dsl`.

## Scalar Type Mapping

| DSL type  | Prisma scalar type |
| --------- | ------------------ |
| `uuid`    | `String`           |
| `string`  | `String`           |
| `text`    | `String`           |
| `integer` | `Int`              |
| `number`  | `Float`            |
| `decimal` | `Decimal`          |
| `date`    | `DateTime`         |
| `boolean` | `Boolean`          |
| enum name | enum name as-is    |

Unknown DSL types pass through as-is for forward compatibility.

## Primary Key Rules

- a field marked `key primary` becomes `@id`
- if the primary key type is `uuid` or the field name is `id`, use `@id @default(uuid())`
- non-uuid natural keys keep plain `@id`
- every entity must resolve to exactly one primary key

## Optionality And Defaults

- primary keys are required
- fields marked `is required` are required
- all other fields are optional with Prisma `?`
- non-primary unique fields get `@unique`
- `default <value>` maps to Prisma `@default(...)`

## Foreign Key And Relation Rules

For a DSL field declared `key foreign { relates Entity.field }`:

1. emit the FK scalar field first
2. add a relation field named `lowerFirst(relatedEntity)`
3. if that relation name collides, append `Ref`
4. annotate with `@relation(fields: [<fkField>], references: [<referencedField>])`

Inverse array relations:

- add inverse array fields for referencing entities automatically
- pluralization rules:
  - `equipment` stays `equipment`
  - names ending in `s` add `es`
  - all others add `s`
- if the inverse name collides, append `List`

## Enum Rules

- every DSL enum becomes a Prisma enum
- preserve declaration order
- preserve the enum name exactly

## Header Preservation

If `server/prisma/schema.prisma` already contains a `generator client { ... }` block, preserve everything before the first `enum` or `model` keyword.

If no valid header exists, emit:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

## Forbidden Patterns

- do not add fields not declared in the DSL
- do not add `@@index`, `@@map`, or schema-level directives not declared by the DSL
- do not add `@db.*` modifiers
- do not change the datasource provider away from `postgresql`

## Completion Expectations

Prisma generation is incomplete if any of the following is true:

- `server/prisma/schema.prisma` does not exist
- the schema no longer reflects the DSL
- required relation fields or inverse arrays are missing
- header generation or preservation breaks Prisma baseline behavior
