import 'dotenv/config';

const REQUIRED = ['CALLBACK_BASE_URL', 'AI_API_URL', 'AI_API_KEY', 'AI_MODEL'] as const;

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

function parseNumber(val: string | undefined): number | undefined {
  if (val === undefined) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

export const config = {
  PORT: process.env.PORT ?? '3006',
  CALLBACK_BASE_URL: process.env.CALLBACK_BASE_URL!,
  AI_API_URL: process.env.AI_API_URL!,
  AI_API_KEY: process.env.AI_API_KEY!,
  AI_MODEL: process.env.AI_MODEL!,
  AI_MAX_TOKENS: parseNumber(process.env.AI_MAX_TOKENS),
  AI_TEMPERATURE: parseNumber(process.env.AI_TEMPERATURE),
  CONTEXT7_ENABLED: process.env.CONTEXT7_ENABLED === 'true',
};
