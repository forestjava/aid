# Frontend Rules

<!-- prompt-version: 2.0 -->
<!-- applies-to: client/src/resources/, client/src/App.tsx -->
<!-- validated-by: tools/validate-generation.mjs §validateApiDslCoverage -->

Use this document during the **E. Parallel Specialized Generation** stage
defined in `prompts/general-prompt.md`.

## Purpose

Generate React Admin resources that stay aligned with the DSL contract, the backend contract, and the repository auth/data provider seams.

Ownership rule:

- this stage belongs to `generator_react_admin_resources` after contract freeze
- parent retains ownership of shared auth strategy, global data-access architecture, runtime, and deploy seams
- resource generation must stay compatible with the frozen data-access and auth contracts rather than redesigning them

## Mandatory Inputs

- `prompts/general-prompt.md`
- the active `api API.<Entity>` block from `domain/toir.api.dsl`
- referenced DTOs and enums from `domain/toir.api.dsl`
- an intact or repaired official Vite React TypeScript scaffold under `client/`

## Expected Outputs

Per entity:

- `client/src/resources/<kebab>/<Entity>List.tsx`
- `client/src/resources/<kebab>/<Entity>Create.tsx`
- `client/src/resources/<kebab>/<Entity>Edit.tsx`
- `client/src/resources/<kebab>/<Entity>Show.tsx`

Repository-wide:

- `client/src/App.tsx` resource registrations

## Scaffold Baseline

- Start frontend initialization and repair from the official Vite React TypeScript scaffold, not from a hand-written shell.
- Preserve workspace essentials:
  - `client/index.html`
  - `client/tsconfig.json`
  - `client/vite.config.*`
  - `client/src/main.tsx`
  - `client/src/vite-env.d.ts`
- Repair the scaffold before generating resources if it is degraded.
- Do not delete `client/src/vite-env.d.ts`. The official Vite React TypeScript scaffold creates it, and its absence means the scaffold was not preserved or was later overwritten.

## Approved Frontend Dependency Baseline

When the frontend workspace is created or repaired, pin the frontend package manifest to these exact versions before continuing:

- `react`: `19.2.4`
- `react-dom`: `19.2.4`
- `react-admin`: `5.14.5`
- `ra-data-simple-rest`: `5.14.5`
- `@mui/material`: `7.3.9`
- `@mui/icons-material`: `7.3.9`
- `@emotion/react`: `11.14.0`
- `@emotion/styled`: `11.14.1`
- `vite`: `8.0.3`
- `@vitejs/plugin-react`: `6.0.1`
- frontend `typescript`: `5.9.3`
- `keycloak-js`: `26.2.3`

Pinning rules:

- Use exact versions, not `latest` and not caret ranges.
- Keep `react` and `react-dom` on the same exact version.
- Keep `react-admin` and `ra-data-simple-rest` on the same exact version line.
- Keep `@mui/material` and `@mui/icons-material` on the same exact version.

## Resource Contract

- Use the shared entity-to-resource naming convention from `prompts/general-prompt.md`.
- Every entity becomes a React Admin resource with `list`, `create`, `edit`, and `show`.
- `Resource` registration in `client/src/App.tsx` must include `show={...}`.
- Every frontend record must work with React Admin's `id` contract, including natural-key entities.

DTO-driven view rules:

- List and Show views use fields from `DTO.<Entity>`
- Create view uses fields from `DTO.<Entity>Create`
- Edit view uses fields from `DTO.<Entity>Update`
- Do not derive form fields directly from model attributes when the DTO contract is narrower

## Input And Field Mapping

Form inputs:

- `integer`, `number`, `decimal` -> `NumberInput`
- `date` -> `DateInput`
- required `boolean` -> `BooleanInput`
- nullable `boolean` -> `NullableBooleanInput`
- enum -> `SelectInput`
- FK reference -> `ReferenceInput` + `AutocompleteInput`

Display fields:

- `integer`, `number`, `decimal` -> `NumberField`
- `date` -> `DateField`
- `boolean` -> `BooleanField`
- enum -> `SelectField`
- FK reference -> `ReferenceField`

Hard failure rule:

- using plain `TextInput` for `integer`, `number`, `decimal`, `date`, or `boolean` is a generation failure

## Filter And Reference Contract

- Lists must expose filters and include a toolbar with `FilterButton`.
- Enum multi-select filters use `SelectArrayInput`.
- Reference filters and form selectors use `ReferenceInput` + `AutocompleteInput` with `filterToQuery={(searchText) => ({ q: searchText })}`.
- FK list/show rendering must use `ReferenceField link=\"show\"`.
- `dataProvider` query serialization must preserve repeated params for array filters.

Reference display expression priority:

1. if `inventoryNumber` exists: ``(record) => `${record.inventoryNumber} — ${record.name ?? record.inventoryNumber}``  
2. else if `code` exists: ``(record) => `${record.code} — ${record.name ?? record.code}``  
3. else if `number` exists: ``(record) => `${record.number} — ${record.name ?? record.number}``  
4. else if `name` exists: `(record) => record.name ?? record.id`  
5. else: `(record) => record.id`

## Auth And Provider Seams

- `client/src/dataProvider.ts` remains the single authenticated request seam.
- `client/src/auth/authProvider.ts` remains the single React Admin auth seam.
- Resource components must not embed auth logic.
- `getIdentity()` resolves from token claims.
- `getPermissions()` may expose realm roles for UI awareness, but backend enforcement stays authoritative.

## Natural-Key Compatibility

- Frontend requests and routes must continue to work when the real primary key is not named `id`.
- Edit/show/delete flows must preserve compatibility with backend natural-key handling.
- Sorting and filtering assumptions must not regress to a fake physical `id`.

## Completion Expectations

Frontend generation is incomplete if any of the following is true:

- required Vite scaffold files are missing
- Create/Edit inputs are type-incorrect
- filter UI is missing or incomplete
- reference fields stop linking to `show`
- resource registration omits `show={...}`
