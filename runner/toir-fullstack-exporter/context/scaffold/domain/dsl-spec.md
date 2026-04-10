# DSL Language Specification

This document describes the DSL system used to specify fullstack CRUD applications.

`domain/*.api.dsl` is the single source of truth for the entire domain model and API
contract. It drives Prisma schema generation, NestJS module generation, and React Admin
resource generation.

`api-summary.json` is a derived artifact generated from the api.dsl to stabilize
LLM-first generation and feed the lightweight validation gate. It must never replace the
DSL as the source of truth. The active prompt corpus that consumes this contract lives in
`prompts/`.

---

# DSL Architecture

## `domain/*.api.dsl`

The api.dsl is the authoritative source of truth for:

- entities and their attributes
- scalar types and enums
- primary keys and foreign keys
- database-level constraints (required, unique, default)
- relations between entities
- DTO shapes per operation (Create, Update, Read, List)
- nullability and requiredness of each DTO attribute per operation
- HTTP methods and paths for each endpoint
- endpoint names and groupings
- pagination request/response contracts

The api.dsl drives: Prisma schema, NestJS controller/service/DTO generation,
and React Admin resource generation.

Constraint: every `map Entity.field` or `sync Entity.field` reference in `domain/*.api.dsl`
must resolve to an entity and field defined within the same api.dsl file.

## Optional extension mechanism

```text
overrides/
  api-overrides.dsl
  ui-overrides.dsl
```

Override rules:

- Overrides are optional.
- The generator must work without them.
- Overrides may refine derived API or UI behavior, but they must not duplicate or redefine
entities, attributes, primary keys, foreign keys, relations, or enums.

---

# DSL Grammar Concepts

## entity

An **entity** is a domain object that becomes a database table and a first-class resource in the backend and frontend.

```
entity Equipment {
  attribute id { type uuid; key primary; }
  attribute name { type string; is required; }
}
```

- **Domain:** Defines the canonical model; one entity = one Prisma model, one NestJS module, one React Admin resource.
- **Naming:** PascalCase (e.g. `Equipment`, `EquipmentType`, `RepairOrder`).

---

## attribute

An **attribute** is a field of an entity. It has a type and optional modifiers.

```
attribute name {
  description "Наименование";
  type string;
  is required;
  is unique;
}
```

**Modifiers:**

- `type` — required; one of: `string`, `uuid`, `integer`, `decimal`, `date`, `text`, `boolean`, `number`, or an enum name.
- `key primary` — this attribute is the primary key.
- `key foreign { relates Entity.field }` — foreign key to another entity's field.
- `is required` — non-nullable.
- `is unique` — unique constraint.
- `is nullable` — explicitly nullable.
- `default Value` — default value (for enums or literals).
- `description "..."` — human-readable description.
- `label "..."` — display label for UI.

---

## enum

An **enum** defines a fixed set of values. Used for attributes that can only take one of these values.

```
enum EquipmentStatus {
  value Active { label "В эксплуатации"; }
  value Repair { label "В ремонте"; }
}
```

- **value** — identifier used in data and code.
- **label** — optional display label for UI.

---

## primary key

Exactly one attribute per entity must be marked as primary key.

```
attribute id {
  type uuid;
  key primary;
}
```

Or for a natural key:

```
attribute code {
  type string;
  key primary;
  is required;
  is unique;
}
```

---

## foreign key

A **foreign key** links to another entity's primary key. The attribute type must match the referenced primary key type.

```
attribute equipmentTypeCode {
  type string;
  key foreign {
    relates EquipmentType.code;
  }
  is required;
}
```

- `relates Entity.attribute` — references `Entity`'s `attribute` (must be primary key).
- FK type must equal referenced PK type (e.g. `string` → `EquipmentType.code`, `uuid` → `Equipment.id`).

---

## required

- **is required** — attribute is non-nullable in the domain model and drives requiredness in derived DTO/API/UI artifacts.
- Absence of `is required` means the attribute is optional (nullable).

---

## default

- **default Value** — applied when no value is provided (e.g. enum defaults like `default Active`).
- Value must exist in the enum when the attribute type is an enum.

---

# DSL → System Component Mapping

## DSL → Prisma


| DSL Concept  | Prisma Result               |
| ------------ | --------------------------- |
| entity       | model                       |
| attribute    | field                       |
| enum         | enum                        |
| key primary  | @id or @id @default(uuid()) |
| key foreign  | relation + references       |
| type string  | String                      |
| type uuid    | String @id @default(uuid()) |
| type integer | Int                         |
| type number  | Float                       |
| type decimal | Decimal                     |
| type date    | DateTime                    |
| type text    | String                      |
| type boolean | Boolean                     |


---

## DSL → NestJS


| DSL Concept                 | NestJS Result                         |
| --------------------------- | ------------------------------------- |
| entity                      | One module (e.g. equipment.module.ts) |
| entity                      | Controller with CRUD endpoints        |
| entity                      | Service with Prisma CRUD              |
| entity + attribute metadata | create-{entity}.dto.ts                |
| entity + attribute metadata | update-{entity}.dto.ts                |
| entity + attribute metadata | Response DTO / API shape              |


API paths are derived from entity name: PascalCase → kebab-case, pluralized (e.g. `Equipment` → `/equipment`, `RepairOrder` → `/repair-orders`).

---

## DSL → React Admin


| DSL Concept          | React Admin Result                  |
| -------------------- | ----------------------------------- |
| entity               | Resource (name = kebab-case plural) |
| attribute            | Form field / column                 |
| type string          | TextInput, TextField                |
| type integer/decimal | NumberInput, NumberField            |
| type number          | NumberInput, NumberField            |
| type date            | DateInput, DateField                |
| type boolean         | BooleanInput, BooleanField          |
| enum                 | SelectInput with choices            |
| foreign key          | ReferenceInput, ReferenceField      |


---

# API DSL Layer Mapping

DTO shapes and endpoint contracts are declared in `domain/*.api.dsl`. The api.dsl
is the authoritative source for:

- **Create DTO** — declared as `dto DTO.<Entity>Create` in api.dsl. Must not include
server-generated primary keys (e.g. no `id` for uuid PKs). Required/nullable per field
is explicit in the api.dsl, not inferred.
- **Update DTO** — declared as `dto DTO.<Entity>Update` in api.dsl. All fields are
typically nullable for partial update semantics.
- **API response shape** — declared as `dto DTO.<Entity>` in api.dsl. Must expose
React Admin-compatible `id` field.
- **UI field mapping** — derived from the DTO shapes in api.dsl, not from domain
attributes directly. The Create form uses `DTO.<Entity>Create` fields; the Edit form
uses `DTO.<Entity>Update` fields; List and Show use `DTO.<Entity>` fields.

