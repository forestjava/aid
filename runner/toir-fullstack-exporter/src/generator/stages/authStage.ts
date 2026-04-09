import type { StageInput } from '../repair.js';
import type { StageResult } from './types.js';

/**
 * Phase 10 — auth stage (deterministic mode).
 *
 * Auth files are now bundled directly in `context/scaffold/`:
 *   - server/src/auth/* — Nest auth module, JwtAuthGuard, RolesGuard, JWKS service
 *   - client/src/auth/* — Keycloak adapter and React Admin authProvider
 *
 * These files are copied during the scaffold stage (Phase 6.5), so the auth
 * stage is now a no-op that simply returns success. The auth seam is stable
 * across all generated apps and only varies by env var values, so using a
 * deterministic template is faster and more reliable than LLM generation.
 *
 * If repair feedback is needed, it would be applied during a re-run of the
 * scaffold stage itself (not auth).
 */
export async function runAuthStage(input: StageInput): Promise<StageResult> {
  // Auth files already copied from scaffold during Phase 6.5.
  // No LLM needed — just acknowledge success.
  console.log('[auth] Auth files already present from scaffold. Stage no-op.');

  return { files: [] };
}

function buildAuthUserPrompt(): string {
  return [
    'Generate the shared auth platform skeleton — server-side JWT/JWKS verification',
    'and client-side Keycloak integration. Follow the rules in the system prompt',
    'exactly. The auth seam must work against any Keycloak realm; all environment',
    'specifics come from env vars at runtime, NOT hardcoded values.',
    '',
    '## Required backend files (server/src/auth/)',
    '',
    '- `auth.module.ts` — exports `JwtAuthGuard`, `RolesGuard`, and the JWKS validator service',
    '- `jwt-auth.guard.ts` — verifies the bearer token via `jose` against JWKS, populates',
    '  `request.user = { sub, roles, ... }`. Public routes (e.g. `/health`) must be skipped',
    '  via a `@Public()` decorator + `Reflector`.',
    '- `roles.guard.ts` — reads `@Roles(...)` metadata and checks against `realm_access.roles`',
    '  extracted by `JwtAuthGuard`. Must run AFTER `JwtAuthGuard`.',
    '- `roles.decorator.ts` — `Roles(...names)` SetMetadata helper.',
    '- `public.decorator.ts` — `Public()` SetMetadata helper for `/health`.',
    '- `jwks.service.ts` — resolves the JWKS in this exact order:',
    '    1. `process.env.KEYCLOAK_JWKS_URL`',
    '    2. OIDC discovery via `${issuer}/.well-known/openid-configuration`',
    '    3. `${issuer}/protocol/openid-connect/certs`',
    '  Reject auth if all three fail (no silent fallback). Issuer comes from',
    '  `process.env.KEYCLOAK_ISSUER_URL`. Audience comes from `process.env.KEYCLOAK_AUDIENCE`.',
    '',
    '## Required frontend files (client/src/auth/)',
    '',
    '- `keycloak.ts` — single shared `keycloak-js` instance configured from',
    '  `import.meta.env.VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`.',
    '  Use `pkceMethod: "S256"` and Authorization Code Flow. Export an `initKeycloak()`',
    '  helper that calls `keycloak.init({ onLoad: "login-required", pkceMethod: "S256",',
    '  checkLoginIframe: false })` and stores the resulting token in `localStorage` under',
    '  `kc_token`. Set up an `onTokenExpired` handler that updates the token via a single',
    '  shared in-flight refresh promise. Do NOT call `loadUserProfile()`.',
    '- `authProvider.ts` — React Admin `AuthProvider` implementing `login`, `logout`,',
    '  `checkAuth`, `checkError` (401 → re-auth, 403 → permission error), `getIdentity`',
    "  (derived from token claims — `sub`, `preferred_username`, `name`), and",
    '  `getPermissions` (returns `realm_access.roles`).',
    '',
    '## Hard rules',
    '',
    '- Do NOT hardcode Keycloak URLs, realm names, client ids, or audiences anywhere.',
    '  All of these MUST be read from env vars (`process.env.*` on the backend,',
    '  `import.meta.env.VITE_*` on the frontend).',
    '- Backend must use `jose` for JWT verification (no `jsonwebtoken`, no `passport-jwt`).',
    '- Frontend must use `keycloak-js` directly (no wrapper libraries).',
    '',
    '## Strict response format',
    '',
    'Respond with a single JSON object only, no prose:',
    '',
    '```json',
    '{"files":[{"path":"server/src/auth/auth.module.ts","content":"..."}, ...]}',
    '```',
    '',
    'All file paths MUST start with either `server/src/auth/` or `client/src/auth/`.',
    'Do NOT generate `app.module.ts`, `App.tsx`, `dataProvider.ts`, the realm JSON,',
    'or any entity module — those are owned by other stages and will be dropped.',
  ].join('\n');
}
