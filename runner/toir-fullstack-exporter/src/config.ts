// Required at runtime for Phase 1+
const REQUIRED = ['CALLBACK_BASE_URL', 'AI_API_URL', 'AI_API_KEY', 'AI_MODEL'] as const;

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

export const config = {
  PORT: process.env.PORT ?? '3030',
  CALLBACK_BASE_URL: process.env.CALLBACK_BASE_URL!,

  // LLM (required, used Phase 3+)
  AI_API_URL: process.env.AI_API_URL!,
  AI_API_KEY: process.env.AI_API_KEY!,
  AI_MODEL: process.env.AI_MODEL!,
  AI_MAX_TOKENS: parseNumber(process.env.AI_MAX_TOKENS),
  AI_TEMPERATURE: parseNumber(process.env.AI_TEMPERATURE),

  // Gitea (optional until Phase 2)
  GITEA_BASE_URL: process.env.GITEA_BASE_URL,
  GITEA_USERNAME: process.env.GITEA_USERNAME,
  GITEA_TOKEN: process.env.GITEA_TOKEN,

  // Portainer (optional until Phase 3)
  PORTAINER_BASE_URL: process.env.PORTAINER_BASE_URL,
  PORTAINER_API_KEY: process.env.PORTAINER_API_KEY,
  PORTAINER_ENDPOINT_ID: parseNumber(process.env.PORTAINER_ENDPOINT_ID),
  PORTAINER_EXTERNAL_NETWORK: process.env.PORTAINER_EXTERNAL_NETWORK ?? 'proxy',

  // Nginx Proxy Manager (optional until Phase 4)
  NPM_BASE_URL: process.env.NPM_BASE_URL,
  NPM_IDENTITY: process.env.NPM_IDENTITY,
  NPM_SECRET: process.env.NPM_SECRET,
  NPM_WILDCARD_CERT_ID: parseNumber(process.env.NPM_WILDCARD_CERT_ID),

  // Deploy
  PUBLIC_DOMAIN_SUFFIX: process.env.PUBLIC_DOMAIN_SUFFIX ?? 'greact.ru',
  CLEANUP_TTL_DAYS: parseNumber(process.env.CLEANUP_TTL_DAYS) ?? 7,

  // Feature flags
  EXPORTER_MOCK_GENERATOR: (process.env.EXPORTER_MOCK_GENERATOR ?? 'true') === 'true',
};
