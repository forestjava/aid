# Auth Rules

<!-- prompt-version: 2.0 -->
<!-- applies-to: client/src/auth/, server/src/auth/, toir-realm.json -->
<!-- validated-by: tools/validate-generation.mjs §validateAuthChecks §validateRealmChecks -->

Use this document during the **D. Shared Platform Scaffold** and **F. Integration**
stages defined in `prompts/general-prompt.md`.

## Purpose

Generate and preserve the auth contracts that let the CRUD app run as a React Admin SPA backed by a NestJS API protected by external Keycloak.
The realm import is a deploy/runtime artifact and is part of the generated workspace, not a sample.

Ownership rule:

- the parent owns the auth platform skeleton and shared auth seams
- specialized generators may attach resource-aware bindings only inside their delegated zones
- do not redesign the shared auth platform from inside a resource generator

## Mandatory Inputs

- `prompts/general-prompt.md`
- `prompts/runtime-rules.md`
- current repository auth/runtime defaults

## Expected Outputs

- `client/src/auth/`
- `client/src/dataProvider.ts`
- `server/src/auth/`
- `toir-realm.json`

## Approved Auth Dependency Baseline

- `keycloak-js`: `26.2.3`
- `jose`: `6.2.2`

Pinning rules:

- Keep frontend auth on the approved `keycloak-js` version during routine regeneration.
- Keep backend JWT verification on the approved `jose` version during routine regeneration.
- Do not upgrade auth library majors implicitly when repairing scaffolds or auth seams.

## Frontend Auth Invariants

- use `keycloak-js` with redirect-based login only
- initialize Keycloak before rendering the SPA
- use Authorization Code Flow + PKCE (`S256`)
- keep `authProvider`, `dataProvider`, `getIdentity()`, `getPermissions()`, and `checkError()` as stable seams
- derive identity from token claims already present in the token
- do not call `loadUserProfile()`
- `401` forces re-authentication; `403` remains an authorization error
- keep token handling in memory with one shared in-flight refresh path

## Backend Auth Invariants

- verify JWTs with `jose`
- validate issuer, audience, and signature via JWKS
- resolve JWKS in this order:
  1. `KEYCLOAK_JWKS_URL`
  2. OIDC discovery at `/.well-known/openid-configuration`
  3. `${issuer}/protocol/openid-connect/certs`
- if all JWKS resolution attempts fail, reject authentication (no silent fallback)
- extract roles only from `realm_access.roles`
- keep `/health` public
- generated CRUD routes stay protected by default

## Working Runtime Defaults

Keep these defaults unless a task explicitly overrides them:

- `VITE_KEYCLOAK_URL=https://sso.greact.ru`
- `VITE_KEYCLOAK_REALM=toir`
- `VITE_KEYCLOAK_CLIENT_ID=toir-frontend`
- `KEYCLOAK_ISSUER_URL=https://sso.greact.ru/realms/toir`
- `KEYCLOAK_AUDIENCE=toir-backend`
- `CORS_ALLOWED_ORIGINS=http://localhost:5173,https://toir-frontend.greact.ru`

Anti-regression rule:

- do not revert shared examples to localhost Keycloak defaults unless a task explicitly requests a local Keycloak baseline

## Realm Artifact Contract

The root realm artifact is mandatory and must:

- be importable and versioned
- align with generated frontend/backend env contracts
- parameterize:
  - realm name
  - frontend client id
  - backend client id / audience
  - local and production frontend URLs
  - artifact filename
- explicitly deliver:
  - `sub`
  - `aud`
  - `realm_access.roles`
- define:
  - realm roles `admin`, `editor`, `viewer`
  - a public SPA client with PKCE S256
  - a bearer-only backend client
  - an explicit audience client scope
  - protocol mappers for baseline identity and role claims

## Completion Expectations

Auth/runtime generation is incomplete if any of the following is true:

- frontend and backend auth seams drift from each other
- JWKS resolution order changes
- `/health` stops being public
- shared Keycloak defaults regress to localhost examples
- the realm artifact no longer matches backend/frontend expectations
