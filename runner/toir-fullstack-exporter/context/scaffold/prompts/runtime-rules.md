# Runtime Rules

<!-- prompt-version: 2.0 -->
<!-- applies-to: docker-compose.yml, server/Dockerfile, client/Dockerfile, client/nginx/default.conf, server/.env.example, client/.env.example, server/docker-entrypoint.sh, db-seed/Dockerfile, db-seed/import.sh -->
<!-- validated-by: tools/validate-generation.mjs §validateRuntimeContractChecks -->

Use this document during the **A. Discovery**, **D. Shared Platform Scaffold**,
and **F. Integration** stages defined in `prompts/general-prompt.md`.

## Purpose

Define the runtime topology, environment defaults, scaffold expectations, deploy packaging, and bootstrap sequence for a buildable generated workspace.

Ownership rule:

- the parent owns runtime/deploy skeletons, shared platform wiring, and env/runtime conventions
- specialized generators may perform only minor resource-aware integration repairs inside explicitly delegated zones
- do not redesign shared deploy/runtime behavior from a resource generator

## Mandatory Inputs

- `prompts/general-prompt.md`
- `prompts/auth-rules.md` when runtime changes affect auth defaults or seams
- current repository runtime/auth defaults

`api-summary.json` is an auxiliary artifact only. Refresh it when validator/tooling requires freshness checks or when a compact inventory helps discovery. Do not treat it as the runtime source of truth.

## Expected Outputs

- `docker-compose.yml`
- `server/Dockerfile`
- `client/Dockerfile`
- `client/nginx/default.conf`
- `server/.env.example`
- `client/.env.example`
- `server/docker-entrypoint.sh`
- `db-seed/Dockerfile`
- `db-seed/import.sh`
- a buildable NestJS workspace under `server/`
- a buildable Vite React TypeScript workspace under `client/`
- any validator-required auxiliary artifacts such as `api-summary.json`

## Baseline Runtime Topology

- `server/` is the backend output path
- `client/` is the frontend output path
- compose-managed services are `postgres`, `server`, `db-seed`, and `client`
- the internal database container remains PostgreSQL-only
- Keycloak remains external to repository runtime
- the project remains LLM-first and prompt-driven
- runtime/deploy artifacts are first-class deliverables, not optional examples

## Proven-Good Runtime Baseline

- preserve the current `server/Dockerfile`, `client/Dockerfile`, `client/nginx/default.conf`, `docker-compose.yml`, `server/docker-entrypoint.sh`, `db-seed/Dockerfile`, and `db-seed/import.sh` behavior unless a contract change requires a targeted update
- treat `docker-compose.yml`, the Dockerfiles, nginx config, env templates, and realm import as deploy-facing outputs that must stay coherent with the auth and validation rules
- the runtime stage may create or repair all files named in `Expected Outputs`; do not describe them as optional support files

## Concrete Runtime Defaults

Backend:

- `PORT=3000`
- `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/toir"`
- `CORS_ALLOWED_ORIGINS="http://localhost:5173,https://toir-frontend.greact.ru"`
- `KEYCLOAK_ISSUER_URL="https://sso.greact.ru/realms/toir"`
- `KEYCLOAK_AUDIENCE="toir-backend"`

Frontend:

- `VITE_API_URL=http://localhost:3000`
- `VITE_KEYCLOAK_URL=https://sso.greact.ru`
- `VITE_KEYCLOAK_REALM=toir`
- `VITE_KEYCLOAK_CLIENT_ID=toir-frontend`

## Runtime Toolchain Baseline

- Runtime Node.js baseline: `22.12.0` or newer within the Node 22 LTS line
- Package manager baseline: `npm` only
- Commit and preserve `package-lock.json` files for `server/` and `client/`
- Do not introduce `pnpm-lock.yaml`, `yarn.lock`, or Bun-specific package-manager assumptions during regeneration
- After CLI scaffolding, replace floating scaffold dependency ranges with the repository-approved exact versions from `AGENTS.md` and `prompts/general-prompt.md`

## Scaffold Expectations

- new or repaired backend workspaces start from the official Nest CLI
- new or repaired frontend workspaces start from the official Vite React TypeScript CLI
- Prisma initialization uses the official Prisma CLI when relevant
- the LLM may customize generated code after scaffold creation, but must not replace official initialization with ad hoc file creation

## Runtime Bootstrap

1. import `toir-realm.json` into Keycloak
2. start PostgreSQL with `docker compose up -d`
3. from `server/`:
   - repair or create the workspace with official Nest CLI if needed
   - install dependencies
   - run Prisma commands required by the schema stage
   - apply Prisma migrations when they exist; use `db push` only as a bootstrap fallback in fresh environments without migrations
   - run `npm run build`
   - run `npm run start`
4. from `client/`:
   - repair or create the workspace with official Vite CLI if needed
   - install dependencies
   - run `npm run build`
   - run `npm run dev`

## Prisma Migration Policy At Runtime

- Current accepted repository state: no committed `server/prisma/migrations/` directory is required for local bootstrap.
- Current runtime behavior therefore preserves the proven-good fallback in `server/docker-entrypoint.sh`:
  - use `prisma migrate deploy` when committed migrations exist
  - otherwise use `prisma db push`
- Preferred target policy for shared and production environments: commit reviewed Prisma migrations and let runtime use `prisma migrate deploy`.
- Treat migration absence as accepted temporary technical debt, not as the long-term deploy standard.

## Completion Expectations

Runtime preparation is incomplete if any of the following is true:

- `server/` is missing or not buildable as a NestJS workspace
- `client/` is missing or not buildable as a Vite React TypeScript workspace
- framework scaffolding was hand-built instead of created or repaired from official CLIs
- shared env defaults drift from the repository auth/runtime contract
- runtime success is claimed without actual build verification
- runtime/deploy outputs named in this file are missing or incoherent with the auth/runtime contract
