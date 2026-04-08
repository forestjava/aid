import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { callLLM } from '../llmClient.js';
import { appendRepairFeedback, type StageInput } from '../repair.js';
import { parseLlmFiles } from './fileParser.js';
import type { FileEntry, StageResult } from './types.js';

const AUTH_RULES_PATH = fileURLToPath(
  new URL('../../../context/prompts/auth-rules.md', import.meta.url),
);

const ALLOWED_PREFIXES = ['server/src/auth/', 'client/src/auth/'];

/**
 * Phase 10 — auth stage. Generates the shared auth platform skeleton from
 * `auth-rules.md`:
 *
 *   - server/src/auth/* — Nest auth module, JwtAuthGuard, RolesGuard, JWKS validator
 *   - client/src/auth/* — Keycloak adapter and React Admin authProvider
 *
 * Output is filtered to `server/src/auth/` and `client/src/auth/` — anything
 * outside those zones is dropped.
 *
 * TODO Phase 14 candidate: replace this LLM call with a deterministic template
 * based on the working defaults in `auth-rules.md`. The auth seam is stable
 * across all generated apps and only varies by env var values, so a fixed
 * template would be both faster and more reliable than an LLM transcription.
 */
export async function runAuthStage(input: StageInput): Promise<StageResult> {
  const systemPrompt = await fs.readFile(AUTH_RULES_PATH, 'utf8');

  const userPrompt = appendRepairFeedback(buildAuthUserPrompt(), input.previousError);

  const { content } = await callLLM({
    systemPrompt,
    userPrompt,
    maxTokens: 12000,
    temperature: 0.2,
    label: 'auth',
  });

  const parsed = parseLlmFiles(content);
  const kept: FileEntry[] = [];
  for (const f of parsed) {
    if (ALLOWED_PREFIXES.some((p) => f.path.startsWith(p))) {
      kept.push(f);
    } else {
      console.warn(
        `[auth] WARN dropped out-of-zone file "${f.path}" (allowed prefixes: ${ALLOWED_PREFIXES.join(', ')})`,
      );
    }
  }

  if (kept.length === 0) {
    throw new Error(`auth stage: no in-zone files returned (raw count=${parsed.length})`);
  }

  return { files: kept };
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
