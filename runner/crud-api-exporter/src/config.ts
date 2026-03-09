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
  PORT: process.env.PORT,
  CALLBACK_BASE_URL: process.env.CALLBACK_BASE_URL!,

  AI_API_URL: process.env.AI_API_URL!,
  AI_API_KEY: process.env.AI_API_KEY!,
  AI_MODEL: process.env.AI_MODEL!,
  AI_MAX_TOKENS: parseNumber(process.env.AI_MAX_TOKENS),
  AI_TEMPERATURE: parseNumber(process.env.AI_TEMPERATURE),
};
