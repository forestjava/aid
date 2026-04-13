import { config } from './config.js';
import { fetchPrismaDocs } from './context7.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  choices: { message: { content: string } }[];
  error?: { message: string };
}

const SYSTEM_PROMPT = `You are a Prisma schema generator. You generate prisma/schema.prisma files from entity descriptions.

RULES:
1. Output ONLY the content of schema.prisma — no markdown fences, no explanations, no preamble.
2. Use Prisma 6 syntax with PostgreSQL provider.
3. Always include the datasource and generator blocks:
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   generator client {
     provider = "prisma-client-js"
   }
4. Use @id @default(uuid()) for primary keys unless the entity specifies otherwise.
5. Use @relation with explicit fields and references for all relations.
6. Map DSL types to Prisma types: String, Int, Float, Boolean, DateTime, Json.
7. Use @updatedAt for updatedAt fields, @default(now()) for createdAt.
8. Add @@map("table_name") if the entity name differs from desired table name.
9. Enums should be defined as Prisma enums.
10. Use camelCase for field names, PascalCase for model names.`;

export async function generatePrismaSchema(dslContent: string): Promise<string> {
  const context7Docs = await fetchPrismaDocs();

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  if (context7Docs) {
    messages.push({
      role: 'user',
      content: `Reference documentation for Prisma schema syntax:\n\n${context7Docs}`,
    });
    messages.push({
      role: 'assistant',
      content: 'I understand the Prisma schema syntax. Please provide the entity descriptions to generate the schema.',
    });
  }

  messages.push({
    role: 'user',
    content: `Generate a complete schema.prisma file for the following DSL entities:\n\n${dslContent}`,
  });

  const body: Record<string, unknown> = {
    model: config.AI_MODEL,
    messages,
  };
  if (config.AI_MAX_TOKENS) body.max_tokens = config.AI_MAX_TOKENS;
  if (config.AI_TEMPERATURE !== undefined) body.temperature = config.AI_TEMPERATURE;

  const res = await fetch(config.AI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.AI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`LLM API error (${res.status}): ${errBody}`);
  }

  const data = await res.json() as ChatResponse;

  if (data.error) {
    throw new Error(`LLM error: ${data.error.message}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response');
  }

  // Strip markdown fences if LLM wraps output
  return content
    .replace(/^```(?:prisma)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
}
