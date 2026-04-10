/**
 * Centralized, typed access to Vite environment variables. All auth/runtime
 * config values must be read through this module so tests and SSR shims can
 * override them in one place.
 */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  keycloakUrl: import.meta.env.VITE_KEYCLOAK_URL ?? 'https://sso.greact.ru',
  keycloakRealm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'toir',
  keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'toir-frontend',
} as const;
